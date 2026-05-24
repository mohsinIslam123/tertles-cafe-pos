// ─────────────────────────────────────────────────────────────────────────────
// Cloud backup service using Supabase REST API directly (no SDK needed).
// Stores one row per device with the full DB snapshot as JSON.
// Owner authenticates via OTP on first device — not implemented here
// since this is a single-device app. Auth via anon key is sufficient
// for a private single-owner setup.
//
// Supabase table required (run once in Supabase SQL editor):
//
//   create table pos_backups (
//     id          uuid primary key default gen_random_uuid(),
//     shop_name   text not null,
//     backed_up_at timestamptz not null default now(),
//     payload     jsonb not null
//   );
//   alter table pos_backups enable row level security;
//   create policy "anon can do all" on pos_backups
//     for all using (true) with check (true);
//
// ─────────────────────────────────────────────────────────────────────────────

import { db, getSetting, setSetting } from '../db';
import { CONFIG } from '../config';

export interface BackupPayload {
  version: number;
  shop_name: string;
  backed_up_at: string;
  categories: unknown[];
  items: unknown[];
  customers: unknown[];
  invoices: unknown[];
  invoice_items: unknown[];
  day_closes: unknown[];
  settings: unknown[];
}

export type BackupStatus = 'idle' | 'syncing' | 'success' | 'error' | 'disabled';

// ─────────────────────────────────────────────────────────────────────────────
// Collect entire DB into one JSON object
// ─────────────────────────────────────────────────────────────────────────────

async function collectPayload(): Promise<BackupPayload> {
  const [categories, items, customers, invoices, invoice_items, day_closes, settings] =
    await Promise.all([
      db.categories.toArray(),
      db.items.toArray(),
      db.customers.toArray(),
      db.invoices.toArray(),
      db.invoice_items.toArray(),
      db.day_closes.toArray(),
      db.settings.toArray(),
    ]);

  return {
    version: 1,
    shop_name: CONFIG.SHOP_NAME,
    backed_up_at: new Date().toISOString(),
    categories, items, customers, invoices,
    invoice_items, day_closes, settings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase upsert — one row per shop (identified by shop_name)
// ─────────────────────────────────────────────────────────────────────────────

async function pushToSupabase(payload: BackupPayload): Promise<void> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SHOP_NAME } = CONFIG;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase not configured. Fill SUPABASE_URL and SUPABASE_ANON_KEY in config.ts.');
  }

  const url = `${SUPABASE_URL}/rest/v1/pos_backups?shop_name=eq.${encodeURIComponent(SHOP_NAME)}`;

  // Try update first (upsert via PATCH)
  const checkRes = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
  });
  const existing = await checkRes.json();

  const method = Array.isArray(existing) && existing.length > 0 ? 'PATCH' : 'POST';
  const endpoint = method === 'POST'
    ? `${CONFIG.SUPABASE_URL}/rest/v1/pos_backups`
    : url;

  const res = await fetch(endpoint, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      shop_name:    SHOP_NAME,
      backed_up_at: payload.backed_up_at,
      payload,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch latest backup from Supabase
// ─────────────────────────────────────────────────────────────────────────────


function toDate(val: unknown): Date | unknown {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return new Date(val);
  return val;
}

function fixDates<T extends Record<string, unknown>>(arr: unknown[], fields: string[]): T[] {
  return (arr as T[]).map(item => {
    const fixed = { ...item } as T;
    for (const f of fields) if (f in fixed) (fixed as Record<string, unknown>)[f] = toDate((fixed as Record<string, unknown>)[f]);
    return fixed;
  });
}

export async function fetchFromSupabase(): Promise<BackupPayload | null> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SHOP_NAME } = CONFIG;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pos_backups?shop_name=eq.${encodeURIComponent(SHOP_NAME)}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0].payload as BackupPayload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore — wipes local DB and replaces with payload
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreFromPayload(payload: BackupPayload): Promise<void> {
  const invoices     = fixDates(payload.invoices,     ['created_at', 'updated_at']);
  const invoice_items= fixDates(payload.invoice_items,['created_at']);
  const day_closes   = fixDates(payload.day_closes,   ['date', 'closed_at', 'opened_at']);

  await db.transaction('rw', [
    db.categories, db.items, db.customers,
    db.invoices, db.invoice_items, db.day_closes, db.settings,
  ], async () => {
    await db.categories.clear();
    await db.items.clear();
    await db.customers.clear();
    await db.invoices.clear();
    await db.invoice_items.clear();
    await db.day_closes.clear();
    await db.settings.clear();

    if (payload.categories.length)    await db.categories.bulkAdd(payload.categories as never[]);
    if (payload.items.length)         await db.items.bulkAdd(payload.items as never[]);
    if (payload.customers.length)     await db.customers.bulkAdd(payload.customers as never[]);
    if (invoices.length)              await db.invoices.bulkAdd(invoices as never[]);
    if (invoice_items.length)         await db.invoice_items.bulkAdd(invoice_items as never[]);
    if (day_closes.length)            await db.day_closes.bulkAdd(day_closes as never[]);
    if (payload.settings.length)      await db.settings.bulkAdd(payload.settings as never[]);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON file export — downloads as .json via anchor click
// ─────────────────────────────────────────────────────────────────────────────

export async function exportJsonFile(): Promise<void> {
  const payload = await collectPayload();
  const json    = JSON.stringify(payload, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  const date    = new Date().toISOString().slice(0, 10);
  a.href        = url;
  a.download    = `ttc-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON file restore — reads file, parses, restores
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreFromJsonFile(file: File): Promise<void> {
  const text    = await file.text();
  const payload = JSON.parse(text) as BackupPayload;
  if (!payload.version || !payload.shop_name) {
    throw new Error('Invalid backup file. This does not look like a TTC POS backup.');
  }
  await restoreFromPayload(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual backup entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runManualBackup(): Promise<void> {
  const payload = await collectPayload();
  await pushToSupabase(payload);
  await setSetting('last_sync_at', new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Nightly scheduler — runs at 2 AM local time
// Call once on app boot. Uses setTimeout to schedule the next run.
// ─────────────────────────────────────────────────────────────────────────────

export function scheduleNightlyBackup(): void {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = CONFIG;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return; // Not configured yet

  const now     = new Date();
  const next2am = new Date(now);
  next2am.setHours(2, 0, 0, 0);
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1);

  const msUntil = next2am.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      await runManualBackup();
    } catch (e) {
      console.warn('Nightly backup failed:', e);
      // Don't throw — never block the app
    }
    // Schedule the next night
    scheduleNightlyBackup();
  }, msUntil);
}
