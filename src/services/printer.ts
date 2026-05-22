// ─────────────────────────────────────────────────────────────────────────────
// Web Bluetooth ESC/POS printer service.
// Target: Chrome on Android (the spec's primary device).
// Tries multiple known 58mm printer GATT service UUIDs in order.
//
// Common 58mm thermal printer GATT UUIDs:
//   GoojPrt / most generic Chinese printers
//   XPrinter, KEFAN, Rongta, MUNBYN etc.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Web Bluetooth API is not in TypeScript's default lib.
// Declare minimal types needed so tsc doesn't complain.
// Chrome on Android supports all of these.
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: object): Promise<BluetoothDevice>;
      getDevices?(): Promise<BluetoothDevice[]>;
    };
  }

  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(char: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    writeValue(data: BufferSource): Promise<void>;
    writeValueWithoutResponse(data: BufferSource): Promise<void>;
  }
}

import { chunkBytes } from '../utils/escpos';

// Known printer service + characteristic UUID pairs to try (in order)
const PRINTER_PROFILES: Array<{ service: string; characteristic: string }> = [
  // GoojPrt / most common generic BLE thermal printers
  {
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  // Generic ESC/POS over BLE (Epson-style)
  {
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
  },
  // Microchip RN4020 (some XPrinter models)
  {
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristic: '49535343-1e4d-4bd9-ba61-23c647249616',
  },
];

const ALL_SERVICE_UUIDS = PRINTER_PROFILES.map(p => p.service);

const CHUNK_MS        = 20;   // ms delay between BLE write chunks
const RECONNECT_DELAY = 1000; // ms between retry attempts
const MAX_RETRIES     = 3;

// ─────────────────────────────────────────────────────────────────────────────

export type PrinterStatus = 'unpaired' | 'idle' | 'connecting' | 'printing' | 'error';

interface PrinterState {
  status: PrinterStatus;
  deviceName: string | null;
  lastError: string | null;
}

type StateListener = (s: PrinterState) => void;

class BluetoothPrinterService {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private state: PrinterState = { status: 'unpaired', deviceName: null, lastError: null };
  private listeners: Set<StateListener> = new Set();
  private lastPrintData: Uint8Array | null = null; // for manual retry

  // ── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    fn(this.state); // emit current state immediately
    return () => this.listeners.delete(fn);
  }

  private emit(update: Partial<PrinterState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach(fn => fn(this.state));
  }

  getState(): PrinterState { return this.state; }

  // ── Browser support check ─────────────────────────────────────────────────

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // ── Pair ──────────────────────────────────────────────────────────────────

  /** Opens browser Bluetooth picker and stores the selected device. */
  async pair(): Promise<{ ok: boolean; reason?: string }> {
    if (!BluetoothPrinterService.isSupported()) {
      return { ok: false, reason: 'Web Bluetooth not supported. Use Chrome on Android.' };
    }

    try {
      this.emit({ status: 'connecting', lastError: null });

      const device = await navigator.bluetooth.requestDevice({
        // acceptAllDevices lets owner pick any printer model
        acceptAllDevices: true,
        optionalServices: ALL_SERVICE_UUIDS,
      });

      this.device = device;

      // Set up disconnect listener for auto-reconnect UX
      device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null;
        if (this.state.status !== 'error') {
          this.emit({ status: 'idle' });
        }
      });

      // Try to connect to verify it works
      const connectResult = await this._connect();
      if (!connectResult.ok) {
        this.device = null;
        return connectResult;
      }

      this.emit({ status: 'idle', deviceName: device.name ?? 'Unknown Printer' });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('cancelled') || msg.includes('chooser')) {
        this.emit({ status: 'unpaired' });
        return { ok: false, reason: 'Pairing cancelled.' };
      }
      this.emit({ status: 'error', lastError: msg });
      return { ok: false, reason: `Pairing failed: ${msg}` };
    }
  }

  /** Forget paired device. */
  async unpair(): Promise<void> {
    if (this.device?.gatt?.connected) {
      try { this.device.gatt.disconnect(); } catch { /* ignore */ }
    }
    this.device = null;
    this.characteristic = null;
    this.lastPrintData = null;
    this.emit({ status: 'unpaired', deviceName: null, lastError: null });
  }

  /** Reconnect previously paired device using getDevices() (no picker). */
  async reconnectSaved(): Promise<{ ok: boolean }> {
    if (!BluetoothPrinterService.isSupported()) return { ok: false };
    if (this.device) return this._connect();

    try {
      // getDevices() returns devices the user has already granted permission for
      if (!('getDevices' in navigator.bluetooth)) return { ok: false };
      const devices = await (navigator.bluetooth as unknown as { getDevices(): Promise<BluetoothDevice[]> }).getDevices();
      if (devices.length === 0) return { ok: false };

      // Use the most recently paired device
      this.device = devices[devices.length - 1];
      this.device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null;
        if (this.state.status !== 'error') this.emit({ status: 'idle' });
      });

      const result = await this._connect();
      if (result.ok) {
        this.emit({ deviceName: this.device.name ?? 'Printer' });
      }
      return result;
    } catch {
      return { ok: false };
    }
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  private async _connect(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.device) return { ok: false, reason: 'No device.' };
    try {
      const server = await this.device.gatt!.connect();

      // Try each known service UUID until one works
      for (const profile of PRINTER_PROFILES) {
        try {
          const service = await server.getPrimaryService(profile.service);
          const char    = await service.getCharacteristic(profile.characteristic);
          this.characteristic = char;
          return { ok: true };
        } catch {
          // Try next profile
        }
      }

      return { ok: false, reason: 'Printer service not found. Check printer model support.' };
    } catch (e: unknown) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Connect failed.' };
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  /** Print data with retry on disconnect. Respects PRINT_COPIES. */
  async print(data: Uint8Array, copies = 1): Promise<{ ok: boolean; reason?: string }> {
    this.lastPrintData = data;
    this.emit({ status: 'printing', lastError: null });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Ensure connected
      if (!this.device?.gatt?.connected || !this.characteristic) {
        const conn = await this._connect();
        if (!conn.ok) {
          if (attempt < MAX_RETRIES) {
            await sleep(RECONNECT_DELAY);
            continue;
          }
          const reason = `Failed after ${MAX_RETRIES} attempts. ${conn.reason ?? ''}`;
          this.emit({ status: 'error', lastError: reason });
          return { ok: false, reason };
        }
      }

      try {
        for (let copy = 0; copy < copies; copy++) {
          await this._writeData(data);
          // Small gap between copies
          if (copies > 1 && copy < copies - 1) await sleep(500);
        }
        this.emit({ status: 'idle', lastError: null });
        return { ok: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.characteristic = null; // Force reconnect on next attempt

        if (attempt < MAX_RETRIES) {
          await sleep(RECONNECT_DELAY);
          continue;
        }

        const reason = `Print failed after ${MAX_RETRIES} attempts: ${msg}`;
        this.emit({ status: 'error', lastError: reason });
        return { ok: false, reason };
      }
    }

    // Should not reach here
    return { ok: false, reason: 'Unknown error.' };
  }

  /** Manual retry using the last print data. */
  async retryLastPrint(copies = 1): Promise<{ ok: boolean; reason?: string }> {
    if (!this.lastPrintData) return { ok: false, reason: 'No previous print job.' };
    return this.print(this.lastPrintData, copies);
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  private async _writeData(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('Not connected.');

    const chunks = chunkBytes(data, 20);
    for (const chunk of chunks) {
      // Copy to a plain ArrayBuffer to satisfy Web Bluetooth's BufferSource type
      const buf = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
      await this.characteristic.writeValueWithoutResponse(buf);
      await sleep(CHUNK_MS);
    }
  }

  isPaired(): boolean {
    return !!this.device;
  }

  isConnected(): boolean {
    return !!(this.device?.gatt?.connected && this.characteristic);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Singleton — one printer per app session
export const printerService = new BluetoothPrinterService();
