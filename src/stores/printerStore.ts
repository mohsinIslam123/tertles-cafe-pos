import { create } from 'zustand';
import { printerService, type PrinterStatus } from '../services/printer';
import { buildReceiptBytes, type ReceiptData } from '../utils/escpos';
import { printReceiptHtml } from '../utils/receiptHtml';
import { CONFIG } from '../config';
import { formatDateTime } from '../utils/format';
import type { Invoice, InvoiceItem } from '../db';
import { db } from '../db';

// ─────────────────────────────────────────────────────────────────────────────

interface PrinterState {
  status: PrinterStatus;
  deviceName: string | null;
  lastError: string | null;
  isSupported: boolean;

  // Actions
  init: () => void;
  pair: () => Promise<{ ok: boolean; reason?: string }>;
  unpair: () => Promise<void>;
  printInvoice: (invoice: Invoice) => Promise<{ ok: boolean; reason?: string }>;
  retryPrint: () => Promise<{ ok: boolean; reason?: string }>;
  printFallback: (invoice: Invoice) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildReceiptData(invoice: Invoice): Promise<ReceiptData> {
  const items = await db.invoice_items
    .where('invoice_id')
    .equals(invoice.id!)
    .toArray();

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  if (invoice.customer_id) {
    const customer = await db.customers.get(invoice.customer_id);
    if (customer) {
      customerName  = customer.name;
      customerPhone = customer.phone;
    }
  }

  // Bill discount label
  let billDiscountLabel: string | null = null;
  if (invoice.bill_discount_type && invoice.bill_discount_value > 0) {
    billDiscountLabel = invoice.bill_discount_type === 'percent'
      ? `Bill Disc ${invoice.bill_discount_value}%:`
      : 'Bill Discount:';
  }

  // Recompute bill discount amount from stored values
  const afterItemDiscount = invoice.subtotal - invoice.item_discount_total;
  const billDiscountAmount = afterItemDiscount - invoice.taxable_amount - invoice.service_charge;

  return {
    shopName:            CONFIG.SHOP_NAME,
    shopAddress:         CONFIG.SHOP_ADDRESS,
    shopPhone:           CONFIG.SHOP_PHONE,
    gstin:               CONFIG.GSTIN,
    invoiceNumber:       invoice.invoice_number,
    dateTime:            formatDateTime(invoice.created_at),
    customerName,
    customerPhone,
    items: items.map((it: InvoiceItem) => ({
      name:         it.item_name_snapshot,
      qty:          it.qty,
      rate:         it.price_snapshot,
      itemDiscount: it.item_discount,
    })),
    subtotal:             invoice.subtotal,
    itemDiscountTotal:    invoice.item_discount_total,
    billDiscountLabel,
    billDiscountAmount:   Math.max(0, billDiscountAmount),
    serviceCharge:        invoice.service_charge,
    serviceChargePercent: CONFIG.SERVICE_CHARGE_PERCENT,
    cgst:                 invoice.cgst,
    sgst:                 invoice.sgst,
    gstRate:              CONFIG.GST_RATE,
    roundOff:             invoice.round_off,
    total:                invoice.total,
    paymentMode:          invoice.payment_mode,
    cashReceived:         invoice.cash_received,
    changeGiven:          invoice.change_given,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const usePrinterStore = create<PrinterState>((set) => ({
  status:      'unpaired',
  deviceName:  null,
  lastError:   null,
  isSupported: false,

  init: () => {
    const isSupported = (typeof navigator !== 'undefined') && 'bluetooth' in navigator;
    set({ isSupported });

    // Subscribe to service state changes
    printerService.subscribe(s => {
      set({
        status:     s.status,
        deviceName: s.deviceName,
        lastError:  s.lastError,
      });
    });

    // Try to reconnect previously paired device silently
    if (isSupported) {
      printerService.reconnectSaved().then(() => {}).catch(() => {});
    }
  },

  pair: async () => {
    const result = await printerService.pair();
    return result;
  },

  unpair: async () => {
    await printerService.unpair();
  },

  printInvoice: async (invoice: Invoice) => {
    if (!printerService.isPaired()) {
      return { ok: false, reason: 'No printer paired. Go to Settings → Pair Printer.' };
    }
    const data  = await buildReceiptData(invoice);
    const bytes = buildReceiptBytes(data);
    return printerService.print(bytes, CONFIG.PRINT_COPIES);
  },

  retryPrint: async () => {
    return printerService.retryLastPrint(CONFIG.PRINT_COPIES);
  },

  printFallback: async (invoice: Invoice) => {
    const data = await buildReceiptData(invoice);
    printReceiptHtml(data);
  },
}));
