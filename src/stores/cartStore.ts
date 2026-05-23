import { create } from 'zustand';
import { db, getSetting, setSetting, getNextInvoiceNumber, peekNextInvoiceNumber } from '../db';
import { computeBill, lineTotal, type CartLine, type BillTotals } from '../utils/billMath';
import { CONFIG, getCurrentFY } from '../config';
import type { Item, Invoice, InvoiceItem } from '../db';

// ─────────────────────────────────────────────────────────────────────────────
// Draft shape stored in IndexedDB
// ─────────────────────────────────────────────────────────────────────────────

interface CartDraft {
  lines: CartLine[];
  billDiscountType: 'percent' | 'flat' | null;
  billDiscountValue: number;
  billDiscountReason: string;
  serviceChargeEnabled: boolean;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  paymentMode: 'cash' | 'upi' | 'card' | null;
  cashReceived: number;
  savedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

interface CartState {
  lines: CartLine[];
  billDiscountType: 'percent' | 'flat' | null;
  billDiscountValue: number;
  billDiscountReason: string;
  serviceChargeEnabled: boolean;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  paymentMode: 'cash' | 'upi' | 'card' | null;
  cashReceived: number;
  nextInvoiceNumber: string;
  totals: BillTotals;
  hasDraft: boolean;

  // Actions
  initCart: () => Promise<void>;
  addItem: (item: Item) => void;
  removeItem: (itemId: number) => void;
  updateQty: (itemId: number, qty: number) => void;
  setItemDiscount: (itemId: number, discount: number) => void;
  setBillDiscount: (type: 'percent' | 'flat' | null, value: number, reason: string) => void;
  toggleServiceCharge: () => void;
  setCustomer: (id: number | null, name: string, phone: string) => void;
  setPaymentMode: (mode: 'cash' | 'upi' | 'card') => void;
  setCashReceived: (amount: number) => void;
  saveBill: () => Promise<{ ok: boolean; invoice?: Invoice; reason?: string }>;
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<boolean>;
  clearCart: () => Promise<void>;
  refreshNextInvoiceNumber: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty totals (used for initial state)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: BillTotals = {
  subtotal: 0, itemDiscountTotal: 0, afterItemDiscount: 0,
  billDiscountAmount: 0, taxableAmount: 0, serviceChargeAmount: 0,
  taxableForGST: 0, cgst: 0, sgst: 0, preRoundTotal: 0, roundOff: 0, total: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Recompute totals helper
// ─────────────────────────────────────────────────────────────────────────────

function recompute(state: Partial<CartState>): BillTotals {
  return computeBill(
    state.lines ?? [],
    state.billDiscountType ?? null,
    state.billDiscountValue ?? 0,
    state.serviceChargeEnabled ?? true,
    CONFIG.SERVICE_CHARGE_PERCENT,
    CONFIG.GST_RATE,
    CONFIG.GST_MODE,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  billDiscountType: null,
  billDiscountValue: 0,
  billDiscountReason: '',
  serviceChargeEnabled: CONFIG.SERVICE_CHARGE_PERCENT > 0,
  customerId: null,
  customerName: '',
  customerPhone: '',
  paymentMode: 'cash',
  cashReceived: 0,
  nextInvoiceNumber: '…',
  totals: EMPTY_TOTALS,
  hasDraft: false,

  // ── Init ───────────────────────────────────────────────────────────────────

  initCart: async () => {
    const fy  = getCurrentFY();
    const num = await peekNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
    const draft = await getSetting<CartDraft>('cart_draft');
    const hasDraft = !!(draft && draft.lines.length > 0);
    set({ nextInvoiceNumber: num, hasDraft });
  },

  // ── Item manipulation ──────────────────────────────────────────────────────

  addItem: (item: Item) => {
    set(state => {
      const existing = state.lines.find(l => l.itemId === item.id);
      let lines: CartLine[];

      if (existing) {
        lines = state.lines.map(l =>
          l.itemId === item.id
            ? { ...l, qty: l.qty + 1 }
            : l
        );
      } else {
        const newLine: CartLine = {
          itemId:       item.id!,
          name:         item.name,
          price:        item.price,
          qty:          1,
          itemDiscount: 0,
        };
        lines = [...state.lines, newLine];
      }

      const next = { ...state, lines };
      return { lines, totals: recompute(next) };
    });
  },

  removeItem: (itemId: number) => {
    set(state => {
      const lines = state.lines.filter(l => l.itemId !== itemId);
      const next = { ...state, lines };
      return { lines, totals: recompute(next) };
    });
  },

  updateQty: (itemId: number, qty: number) => {
    if (qty <= 0) { get().removeItem(itemId); return; }
    set(state => {
      const lines = state.lines.map(l =>
        l.itemId === itemId ? { ...l, qty } : l
      );
      const next = { ...state, lines };
      return { lines, totals: recompute(next) };
    });
  },

  setItemDiscount: (itemId: number, discount: number) => {
    set(state => {
      const lines = state.lines.map(l => {
        if (l.itemId !== itemId) return l;
        // Cap at line subtotal (can't discount more than item costs)
        const maxDiscount = l.price * l.qty;
        const capped = Math.min(Math.max(0, discount), maxDiscount);
        return { ...l, itemDiscount: capped };
      });
      const next = { ...state, lines };
      return { lines, totals: recompute(next) };
    });
  },

  setBillDiscount: (type, value, reason) => {
    set(state => {
      const next = { ...state, billDiscountType: type, billDiscountValue: value, billDiscountReason: reason };
      return {
        billDiscountType: type,
        billDiscountValue: value,
        billDiscountReason: reason,
        totals: recompute(next),
      };
    });
  },

  toggleServiceCharge: () => {
    set(state => {
      const serviceChargeEnabled = !state.serviceChargeEnabled;
      const next = { ...state, serviceChargeEnabled };
      return { serviceChargeEnabled, totals: recompute(next) };
    });
  },

  setCustomer: (id, name, phone) => set({ customerId: id, customerName: name, customerPhone: phone }),

  setPaymentMode: (mode) => set({ paymentMode: mode, cashReceived: 0 }),

  setCashReceived: (amount) => set({ cashReceived: amount }),

  // ── Save bill ──────────────────────────────────────────────────────────────

  saveBill: async () => {
    const state = get();

    // Validate
    if (state.lines.length === 0)       return { ok: false, reason: 'Cart is empty.' };
    if (!state.paymentMode)             return { ok: false, reason: 'Select a payment mode.' };
    if (
      state.paymentMode === 'cash' &&
      state.cashReceived > 0 &&
      state.cashReceived < state.totals.total
    ) {
      return { ok: false, reason: `Cash received (₹${state.cashReceived}) is less than total (₹${state.totals.total}).` };
    }

    try {
      const fy             = getCurrentFY();
      const invoiceNumber  = await getNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
      const t              = state.totals;
      const now            = new Date();
      const changeGiven    = state.paymentMode === 'cash'
        ? Math.max(0, state.cashReceived - t.total)
        : 0;

      let savedInvoice!: Invoice;

      await db.transaction('rw', [db.invoices, db.invoice_items, db.customers], async () => {
        // Create invoice
        const invoiceId = await db.invoices.add({
          invoice_number:       invoiceNumber,
          customer_id:          state.customerId,
          subtotal:             t.subtotal,
          item_discount_total:  t.itemDiscountTotal,
          bill_discount_type:   state.billDiscountType,
          bill_discount_value:  state.billDiscountValue,
          bill_discount_reason: state.billDiscountReason,
          service_charge:       t.serviceChargeAmount,
          taxable_amount:       t.taxableAmount,
          cgst:                 t.cgst,
          sgst:                 t.sgst,
          round_off:            t.roundOff,
          total:                t.total,
          payment_mode:         state.paymentMode!,
          cash_received:        state.cashReceived,
          change_given:         changeGiven,
          status:               'saved',
          created_at:           now,
          cancelled_at:         null,
          cancel_reason:        '',
          synced_at:            null,
        });

        // Create invoice items
        const invoiceItems: Omit<InvoiceItem, 'id'>[] = state.lines.map(line => ({
          invoice_id:          invoiceId as number,
          item_id:             line.itemId,
          item_name_snapshot:  line.name,
          price_snapshot:      line.price,
          qty:                 line.qty,
          item_discount:       line.itemDiscount,
          line_total:          lineTotal(line),
        }));
        await db.invoice_items.bulkAdd(invoiceItems);

        // Update customer stats
        if (state.customerId) {
          const customer = await db.customers.get(state.customerId);
          if (customer) {
            await db.customers.update(state.customerId, {
              total_spent: (customer.total_spent ?? 0) + t.total,
              last_visit:  now,
            });
          }
        }

        savedInvoice = await db.invoices.get(invoiceId as number) as Invoice;
      });

      // Clear cart + draft
      await get().clearCart();

      // Refresh next invoice number for next bill
      const nextNum = await peekNextInvoiceNumber(CONFIG.INVOICE_PREFIX, getCurrentFY());
      set({ nextInvoiceNumber: nextNum });

      return { ok: true, invoice: savedInvoice };
    } catch (e) {
      console.error('saveBill error:', e);
      return { ok: false, reason: 'Save failed. Try again.' };
    }
  },

  // ── Draft ──────────────────────────────────────────────────────────────────

  saveDraft: async () => {
    const { lines, billDiscountType, billDiscountValue, billDiscountReason,
            serviceChargeEnabled, customerId, customerName, customerPhone,
            paymentMode, cashReceived } = get();

    if (lines.length === 0) {
      // Nothing to draft
      await db.settings.delete('cart_draft');
      set({ hasDraft: false });
      return;
    }

    const draft: CartDraft = {
      lines, billDiscountType, billDiscountValue, billDiscountReason,
      serviceChargeEnabled, customerId, customerName, customerPhone,
      paymentMode, cashReceived,
      savedAt: new Date().toISOString(),
    };
    await setSetting('cart_draft', draft);
    set({ hasDraft: true });
  },

  loadDraft: async () => {
    const draft = await getSetting<CartDraft>('cart_draft');
    if (!draft || draft.lines.length === 0) return false;

    // Validate items still exist in DB
    const itemIds = draft.lines.map(l => l.itemId);
    const existingItems = await db.items.where('id').anyOf(itemIds).toArray();
    const existingIds   = new Set(existingItems.map(i => i.id!));
    const validLines    = draft.lines.filter(l => existingIds.has(l.itemId));

    if (validLines.length === 0) {
      await db.settings.delete('cart_draft');
      set({ hasDraft: false });
      return false;
    }

    const next = {
      lines:                validLines,
      billDiscountType:     draft.billDiscountType,
      billDiscountValue:    draft.billDiscountValue,
      billDiscountReason:   draft.billDiscountReason,
      serviceChargeEnabled: draft.serviceChargeEnabled,
      customerId:           draft.customerId,
      customerName:         draft.customerName,
      customerPhone:        draft.customerPhone,
      paymentMode:          draft.paymentMode ?? 'cash',
      cashReceived:         draft.cashReceived,
    };

    set({ ...next, totals: recompute(next), hasDraft: true });
    return true;
  },

  clearCart: async () => {
    await db.settings.delete('cart_draft');
    const fy  = getCurrentFY();
    const num = await peekNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
    set({
      lines: [],
      billDiscountType:     null,
      billDiscountValue:    0,
      billDiscountReason:   '',
      serviceChargeEnabled: CONFIG.SERVICE_CHARGE_PERCENT > 0,
      customerId:           null,
      customerName:         '',
      customerPhone:        '',
      paymentMode:          'cash',
      cashReceived:         0,
      totals:               EMPTY_TOTALS,
      nextInvoiceNumber:    num,
      hasDraft:             false,
    });
  },

  refreshNextInvoiceNumber: async () => {
    const fy  = getCurrentFY();
    const num = await peekNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
    set({ nextInvoiceNumber: num });
  },
}));
