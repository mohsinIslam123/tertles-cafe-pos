import Dexie, { type Table } from 'dexie';

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface Category {
  id?: number;
  name: string;
  sort_order: number;
}

export interface Item {
  id?: number;
  category_id: number;
  code: string;
  name: string;
  price: number;
  is_veg: boolean;
  in_stock: boolean;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  total_spent: number;
  last_visit: Date | null;
}

export interface Invoice {
  id?: number;
  invoice_number: string;
  customer_id: number | null;
  subtotal: number;
  item_discount_total: number;
  bill_discount_type: 'percent' | 'flat' | null;
  bill_discount_value: number;
  bill_discount_reason: string;
  service_charge: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  round_off: number;
  total: number;
  // ── Payment ─────────────────────────────────────────────────────────────────
  payment_mode: 'cash' | 'upi' | 'card' | 'split'; // 'split' = multiple modes
  payment_split?: {                                   // populated when split
    cash: number;
    upi: number;
    card: number;
  };
  cash_received: number;   // for split: total cash component
  change_given: number;
  // ── Status ──────────────────────────────────────────────────────────────────
  status: 'saved' | 'cancelled';
  created_at: Date;
  cancelled_at: Date | null;
  cancel_reason: string;
  synced_at: Date | null;
  // ── Optional: table number for KOT ──────────────────────────────────────────
  table_number?: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id: number;
  item_id: number;
  item_name_snapshot: string;
  price_snapshot: number;
  qty: number;
  item_discount: number;
  line_total: number;
}

export interface DayClose {
  id?: number;
  date: string;
  opening_cash: number;
  total_sales: number;
  bills_count: number;
  total_cash: number;
  total_upi: number;
  total_card: number;
  closing_cash: number;
  variance: number;
  notes: string;
  closed_at: Date;
}

export interface Setting {
  key: string;
  value: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dexie database class
// ─────────────────────────────────────────────────────────────────────────────

class TurtlesPOS extends Dexie {
  categories!:   Table<Category, number>;
  items!:        Table<Item, number>;
  customers!:    Table<Customer, number>;
  invoices!:     Table<Invoice, number>;
  invoice_items!:Table<InvoiceItem, number>;
  day_closes!:   Table<DayClose, number>;
  settings!:     Table<Setting, string>;

  constructor() {
    super('TurtlesPOS');

    // Version 1 — original schema (never change this)
    this.version(1).stores({
      categories:    '++id, sort_order',
      items:         '++id, &code, category_id, name, in_stock',
      customers:     '++id, &phone, name',
      invoices:      '++id, &invoice_number, customer_id, status, created_at, payment_mode',
      invoice_items: '++id, invoice_id, item_id',
      day_closes:    '++id, &date',
      settings:      'key',
    });

    // Version 2 — adds payment_split + table_number (JSON fields, no index change)
    // Safe upgrade: existing rows just get undefined for new fields.
    this.version(2).stores({
      categories:    '++id, sort_order',
      items:         '++id, &code, category_id, name, in_stock',
      customers:     '++id, &phone, name',
      invoices:      '++id, &invoice_number, customer_id, status, created_at, payment_mode',
      invoice_items: '++id, invoice_id, item_id',
      day_closes:    '++id, &date',
      settings:      'key',
    });
  }
}

export const db = new TurtlesPOS();

// ─────────────────────────────────────────────────────────────────────────────
// Settings helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  if (row === undefined) return undefined;
  return JSON.parse(row.value) as T;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value: JSON.stringify(value) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice number helpers
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceCounter {
  fy: string;
  serial: number;
}

export async function getNextInvoiceNumber(
  prefix: string,
  currentFY: string,
): Promise<string> {
  return db.transaction('rw', db.settings, async () => {
    const counter = await getSetting<InvoiceCounter>('invoice_counter');
    let serial = 1;
    if (counter && counter.fy === currentFY) {
      serial = counter.serial + 1;
    }
    await setSetting<InvoiceCounter>('invoice_counter', { fy: currentFY, serial });
    const padded = String(serial).padStart(4, '0');
    return `${prefix}/${currentFY}/${padded}`;
  });
}

export async function peekNextInvoiceNumber(
  prefix: string,
  currentFY: string,
): Promise<string> {
  const counter = await getSetting<InvoiceCounter>('invoice_counter');
  let serial = 1;
  if (counter && counter.fy === currentFY) {
    serial = counter.serial + 1;
  }
  return `${prefix}/${currentFY}/${String(serial).padStart(4, '0')}`;
}
