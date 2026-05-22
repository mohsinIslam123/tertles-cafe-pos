// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS builder for 58mm thermal printers.
// 32 characters per line at standard density.
// Avoids ₹ symbol — uses Rs. for ASCII compatibility.
// ─────────────────────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// Column widths for 58mm (total = 32)
const COL_NAME = 16;
const COL_QTY  = 4;
const COL_RATE = 6;
const COL_AMT  = 6;

// Totals row: label + amount
const COL_LABEL = 22;
const COL_VALUE = 10;

// ── String helpers ────────────────────────────────────────────────────────────

function padR(s: string, len: number): string {
  return s.substring(0, len).padEnd(len, ' ');
}

function padL(s: string, len: number): string {
  return s.substring(0, len).padStart(len, ' ');
}

function center(s: string, len = 32): string {
  if (s.length >= len) return s.substring(0, len);
  const pad = Math.floor((len - s.length) / 2);
  return ' '.repeat(pad) + s;
}

function divider(char: string, len = 32): string {
  return char.repeat(len);
}

function moneyStr(amount: number): string {
  return `Rs.${Math.abs(amount).toFixed(2)}`;
}

// ── ESC/POS builder ───────────────────────────────────────────────────────────

class EscPosBuilder {
  private buf: number[] = [];
  private enc = new TextEncoder();

  init(): this {
    this.buf.push(ESC, 0x40);           // Initialize printer
    this.buf.push(ESC, 0x32);           // Default line spacing
    return this;
  }

  align(a: 'left' | 'center' | 'right'): this {
    const n = a === 'left' ? 0 : a === 'center' ? 1 : 2;
    this.buf.push(ESC, 0x61, n);
    return this;
  }

  bold(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Double height only — keeps 32-char line width */
  doubleHeight(on: boolean): this {
    this.buf.push(GS, 0x21, on ? 0x01 : 0x00);
    return this;
  }

  text(s: string): this {
    const safe = s.replace(/₹/g, 'Rs.').replace(/[^\x00-\x7F]/g, '?');
    const bytes = this.enc.encode(safe);
    bytes.forEach(b => this.buf.push(b));
    return this;
  }

  line(s = ''): this {
    return this.text(s).feed(1);
  }

  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.buf.push(LF);
    return this;
  }

  /** Full paper cut */
  cut(): this {
    this.buf.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ── Receipt formatter ─────────────────────────────────────────────────────────

export interface ReceiptData {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  gstin: string;
  invoiceNumber: string;
  dateTime: string;
  customerName: string | null;
  customerPhone: string | null;
  items: {
    name: string;
    qty: number;
    rate: number;
    itemDiscount: number;
  }[];
  subtotal: number;
  itemDiscountTotal: number;
  billDiscountLabel: string | null;
  billDiscountAmount: number;
  serviceCharge: number;
  serviceChargePercent: number;
  cgst: number;
  sgst: number;
  gstRate: number;
  roundOff: number;
  total: number;
  paymentMode: 'cash' | 'upi' | 'card';
  cashReceived: number;
  changeGiven: number;
}

export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const b = new EscPosBuilder();

  b.init();

  // ── Header ────────────────────────────────────────────────────────────────
  b.align('center');
  b.bold(true).doubleHeight(true).line(data.shopName).doubleHeight(false).bold(false);
  b.line(center(data.shopAddress));

  const contactLine = `GSTIN:${data.gstin} Ph:${data.shopPhone}`;
  b.line(center(contactLine));
  b.line(divider('='));

  // ── Invoice details ───────────────────────────────────────────────────────
  b.align('left');
  b.line(`Invoice: ${data.invoiceNumber}`);
  b.line(`Date: ${data.dateTime}`);
  if (data.customerName) {
    const cust = `${data.customerName}${data.customerPhone ? ` (${data.customerPhone})` : ''}`;
    b.line(`Customer: ${cust}`);
  }
  b.line(divider('-'));

  // ── Column header ─────────────────────────────────────────────────────────
  b.bold(true);
  b.line(
    padR('Item', COL_NAME) +
    padL('Qty', COL_QTY) +
    padL('Rate', COL_RATE) +
    padL('Amt', COL_AMT)
  );
  b.bold(false);
  b.line(divider('-'));

  // ── Items ─────────────────────────────────────────────────────────────────
  for (const item of data.items) {
    const lineAmt = item.qty * item.rate - item.itemDiscount;
    b.line(
      padR(item.name, COL_NAME) +
      padL(String(item.qty), COL_QTY) +
      padL(String(item.rate), COL_RATE) +
      padL(String(Math.round(lineAmt)), COL_AMT)
    );
    if (item.itemDiscount > 0) {
      b.line(padR(`  Disc: -Rs.${item.itemDiscount.toFixed(2)}`, 32));
    }
  }
  b.line(divider('-'));

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRow = (label: string, amount: number, prefix = '') => {
    const amtStr = prefix + moneyStr(amount);
    b.line(padR(label, COL_LABEL) + padL(amtStr, COL_VALUE));
  };

  totalRow('Subtotal:', data.subtotal);
  if (data.itemDiscountTotal > 0) totalRow('Item Discount:', data.itemDiscountTotal, '-');
  if (data.billDiscountAmount > 0 && data.billDiscountLabel) {
    totalRow(data.billDiscountLabel, data.billDiscountAmount, '-');
  }
  if (data.serviceCharge > 0) {
    totalRow(`Service Charge ${data.serviceChargePercent}%:`, data.serviceCharge, '+');
  }
  if (data.cgst > 0) {
    totalRow(`CGST ${data.gstRate / 2}%:`, data.cgst);
    totalRow(`SGST ${data.gstRate / 2}%:`, data.sgst);
  }
  if (data.roundOff !== 0) {
    totalRow('Round Off:', Math.abs(data.roundOff), data.roundOff > 0 ? '+' : '-');
  }

  b.bold(true);
  totalRow('TOTAL:', data.total);
  b.bold(false);
  b.line(divider('='));

  // ── Payment ───────────────────────────────────────────────────────────────
  b.line(`Payment: ${data.paymentMode.toUpperCase()}`);
  if (data.paymentMode === 'cash' && data.cashReceived > 0) {
    totalRow('Cash Received:', data.cashReceived);
    b.bold(true);
    totalRow('Change:', data.changeGiven);
    b.bold(false);
  }
  b.line(divider('='));

  // ── Footer ────────────────────────────────────────────────────────────────
  b.align('center');
  b.line('Thank you, visit again!');
  b.feed(3);
  b.cut();

  return b.build();
}

/** Chunk byte array for BLE writes (max 20 bytes per packet for compatibility) */
export function chunkBytes(data: Uint8Array, size = 20): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
}
