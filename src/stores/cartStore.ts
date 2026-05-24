import { create } from 'zustand';
import { db, getSetting, setSetting, getNextInvoiceNumber, peekNextInvoiceNumber } from '../db';
import { computeBill, lineTotal, type CartLine, type BillTotals } from '../utils/billMath';
import { CONFIG, getCurrentFY } from '../config';
import type { Item, Invoice, InvoiceItem } from '../db';

// ─────────────────────────────────────────────────────────────────────────────
// Types
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
  paymentMode: 'cash' | 'upi' | 'card' | 'split' | null;
  cashReceived: number;
  splitAmounts: { cash: number; upi: number; card: number };
  tableNumber: string;
  savedAt: string;
}

interface CartState {
  lines: CartLine[];
  billDiscountType: 'percent' | 'flat' | null;
  billDiscountValue: number;
  billDiscountReason: string;
  serviceChargeEnabled: boolean;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  paymentMode: 'cash' | 'upi' | 'card' | 'split' | null;
  cashReceived: number;
  splitAmounts: { cash: number; upi: number; card: number };
  tableNumber: string;
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
  setPaymentMode: (mode: 'cash' | 'upi' | 'card' | 'split') => void;
  setCashReceived: (amount: number) => void;
  setSplitAmount: (mode: 'cash' | 'upi' | 'card', amount: number) => void;
  setTableNumber: (table: string) => void;
  saveBill: () => Promise<{ ok: boolean; invoice?: Invoice; reason?: string }>;
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<boolean>;
  clearCart: () => Promise<void>;
  refreshNextInvoiceNumber: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: BillTotals = {
  subtotal: 0, itemDiscountTotal: 0, afterItemDiscount: 0,
  billDiscountAmount: 0, taxableAmount: 0, serviceChargeAmount: 0,
  taxableForGST: 0, cgst: 0, sgst: 0, preRoundTotal: 0, roundOff: 0, total: 0,
};

const EMPTY_SPLIT = { cash: 0, upi: 0, card: 0 };

function recompute(state: Partial<CartState>): BillTotals {
  const activeLines = (state.lines ?? []).filter(l => l.qty > 0);
  return computeBill(
    activeLines,
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
  splitAmounts: EMPTY_SPLIT,
  tableNumber: '',
  nextInvoiceNumber: '…',
  totals: EMPTY_TOTALS,
  hasDraft: false,

  // ── Init ───────────────────────────────────────────────────────────────────

  initCart: async () => {
    const fy    = getCurrentFY();
    const num   = await peekNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
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
          l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      } else {
        lines = [...state.lines, {
          itemId: item.id!, name: item.name, price: item.price, qty: 1, itemDiscount: 0,
        }];
      }
      const next = { ...state, lines };
      return { lines, totals: recompute(next) };
    });
  },

  removeItem: (itemId: number) => {
    set(state => {
      const lines = state.lines.filter(l => l.itemId !== itemId);
      return { lines, totals: recompute({ ...state, lines }) };
    });
  },

  // qty=0 allowed — item stays visible in cart showing "00"
  updateQty: (itemId: number, qty: number) => {
    if (qty < 0) return;
    set(state => {
      const lines = state.lines.map(l => l.itemId === itemId ? { ...l, qty } : l);
      return { lines, totals: recompute({ ...state, lines }) };
    });
  },

  setItemDiscount: (itemId: number, discount: number) => {
    set(state => {
      const lines = state.lines.map(l => {
        if (l.itemId !== itemId) return l;
        const capped = Math.min(Math.max(0, discount), l.price * l.qty);
        return { ...l, itemDiscount: capped };
      });
      return { lines, totals: recompute({ ...state, lines }) };
    });
  },

  setBillDiscount: (type, value, reason) => {
    set(state => {
      const next = { ...state, billDiscountType: type, billDiscountValue: value, billDiscountReason: reason };
      return { billDiscountType: type, billDiscountValue: value, billDiscountReason: reason, totals: recompute(next) };
    });
  },

  toggleServiceCharge: () => {
    set(state => {
      const serviceChargeEnabled = !state.serviceChargeEnabled;
      return { serviceChargeEnabled, totals: recompute({ ...state, serviceChargeEnabled }) };
    });
  },

  setCustomer: (id, name, phone) => set({ customerId: id, customerName: name, customerPhone: phone }),

  setPaymentMode: (mode) => set({ paymentMode: mode }),

  setCashReceived: (amount) => set({ cashReceived: amount }),

  setSplitAmount: (mode, amount) => {
    set(state => ({
      splitAmounts: { ...state.splitAmounts, [mode]: amount },
    }));
  },

  setTableNumber: (table) => set({ tableNumber: table }),

  // ── Save bill ──────────────────────────────────────────────────────────────

  saveBill: async () => {
    const state = get();
    const activeLines = state.lines.filter(l => l.qty > 0);

    if (activeLines.length === 0) return { ok: false, reason: 'Cart is empty.' };
    if (!state.paymentMode)       return { ok: false, reason: 'Select a payment mode.' };

    const t = state.totals;

    // Validate cash payment
    if (state.paymentMode === 'cash') {
      if (state.cashReceived > 0 && state.cashReceived < t.total) {
        return { ok: false, reason: `Cash received (₹${state.cashReceived}) is less than total (₹${t.total}).` };
      }
    }

    // Validate split payment
    if (state.paymentMode === 'split') {
      const splitTotal = state.splitAmounts.cash + state.splitAmounts.upi + state.splitAmounts.card;
      if (Math.abs(splitTotal - t.total) > 1) {
        return {
          ok: false,
          reason: `Split amounts (₹${splitTotal}) must equal total (₹${t.total}). Difference: ₹${Math.abs(splitTotal - t.total).toFixed(2)}.`,
        };
      }
    }

    try {
      const fy            = getCurrentFY();
      const invoiceNumber = await getNextInvoiceNumber(CONFIG.INVOICE_PREFIX, fy);
      const now           = new Date();
      const changeGiven   = state.paymentMode === 'cash'
        ? Math.max(0, state.cashReceived - t.total)
        : 0;

      // For split: cash_received is the cash component
      const cashReceivedFinal = state.paymentMode === 'split'
        ? state.splitAmounts.cash
        : state.cashReceived;

      let savedInvoice!: Invoice;

      await db.transaction('rw', [db.invoices, db.invoice_items, db.customers], async () => {
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
          payment_split:        state.paymentMode === 'split' ? state.splitAmounts : undefined,
          cash_received:        cashReceivedFinal,
          change_given:         changeGiven,
          status:               'saved',
          created_at:           now,
          cancelled_at:         null,
          cancel_reason:        '',
          synced_at:            null,
          table_number:         state.tableNumber || undefined,
        });

        const invoiceItems: Omit<InvoiceItem, 'id'>[] = activeLines.map(line => ({
          invoice_id:         invoiceId as number,
          item_id:            line.itemId,
          item_name_snapshot: line.name,
          price_snapshot:     line.price,
          qty:                line.qty,
          item_discount:      line.itemDiscount,
          line_total:         lineTotal(line),
        }));
        await db.invoice_items.bulkAdd(invoiceItems);

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

      await get().clearCart();
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
    const state = get();
    const activeLines = state.lines.filter(l => l.qty > 0);
    if (activeLines.length === 0) {
      await db.settings.delete('cart_draft');
      set({ hasDraft: false });
      return;
    }
    const draft: CartDraft = {
      lines:                activeLines,
      billDiscountType:     state.billDiscountType,
      billDiscountValue:    state.billDiscountValue,
      billDiscountReason:   state.billDiscountReason,
      serviceChargeEnabled: state.serviceChargeEnabled,
      customerId:           state.customerId,
      customerName:         state.customerName,
      customerPhone:        state.customerPhone,
      paymentMode:          state.paymentMode,
      cashReceived:         state.cashReceived,
      splitAmounts:         state.splitAmounts,
      tableNumber:          state.tableNumber,
      savedAt:              new Date().toISOString(),
    };
    await setSetting('cart_draft', draft);
    set({ hasDraft: true });
  },

  loadDraft: async () => {
    const draft = await getSetting<CartDraft>('cart_draft');
    if (!draft || draft.lines.length === 0) return false;
    const itemIds       = draft.lines.map(l => l.itemId);
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
      splitAmounts:         draft.splitAmounts ?? EMPTY_SPLIT,
      tableNumber:          draft.tableNumber ?? '',
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
      splitAmounts:         EMPTY_SPLIT,
      tableNumber:          '',
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
