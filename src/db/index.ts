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
  code: string;       // unique, used for quick-add shortcut
  name: string;
  price: number;      // stored in rupees, 2 decimal places
  is_veg: boolean;
  in_stock: boolean;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;      // unique, 10 digits
  total_spent: number;
  last_visit: Date | null;
}

export interface Invoice {
  id?: number;
  invoice_number: string;          // e.g. TTC/25-26/0001
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
  payment_mode: 'cash' | 'upi' | 'card';
  cash_received: number;
  change_given: number;
  status: 'saved' | 'cancelled';
  created_at: Date;
  cancelled_at: Date | null;
  cancel_reason: string;
  synced_at: Date | null;
}

export interface InvoiceItem {
  id?: number;
  invoice_id: number;
  item_id: number;
  item_name_snapshot: string;  // name at time of billing (item may be edited later)
  price_snapshot: number;      // price at time of billing
  qty: number;
  item_discount: number;       // flat rupee discount on this line
  line_total: number;          // (price_snapshot * qty) - item_discount
}

export interface DayClose {
  id?: number;
  date: string;              // "YYYY-MM-DD" — unique, one per day
  opening_cash: number;
  total_sales: number;
  bills_count: number;
  total_cash: number;
  total_upi: number;
  total_card: number;
  closing_cash: number;
  variance: number;          // cash_collected + opening - closing
  notes: string;
  closed_at: Date;
}

export interface Setting {
  key: string;
  value: string;   // JSON-serialized
}

// ─────────────────────────────────────────────────────────────────────────────
// Dexie database class
// ─────────────────────────────────────────────────────────────────────────────

class TurtlesPOS extends Dexie {
  categories!: Table<Category, number>;
  items!: Table<Item, number>;
  customers!: Table<Customer, number>;
  invoices!: Table<Invoice, number>;
  invoice_items!: Table<InvoiceItem, number>;
  day_closes!: Table<DayClose, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('TurtlesPOS');

    this.version(1).stores({
      // Indexes: first = primary key, others = queryable fields.
      // ++id = auto-increment primary key.
      // & = unique constraint.
      categories: '++id, sort_order',
      items:       '++id, &code, category_id, name, in_stock',
      customers:   '++id, &phone, name',
      invoices:    '++id, &invoice_number, customer_id, status, created_at, payment_mode',
      invoice_items:'++id, invoice_id, item_id',
      day_closes:  '++id, &date',
      settings:    'key',     // key is primary (non-auto), e.g. "pin_hash"
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
  fy: string;        // e.g. "25-26"
  serial: number;    // current highest serial used
}

/**
 * Returns the next invoice number as a formatted string AND increments the
 * counter atomically inside a Dexie transaction.
 *
 * Format: TTC/25-26/0001
 */
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
    // If FY changed or no counter exists, serial resets to 1.

    await setSetting<InvoiceCounter>('invoice_counter', { fy: currentFY, serial });

    const padded = String(serial).padStart(4, '0');
    return `${prefix}/${currentFY}/${padded}`;
  });
}

/**
 * Peek at what the next invoice number will be without incrementing.
 * Used to show "Next invoice: TTC/25-26/0042" in the cart UI.
 */
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
