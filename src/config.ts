// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Supabase keys + PIN reset secret are read from environment
// variables. Never hardcode them here.
//
// Local dev: create a file called .env.local in the root of the project:
//   VITE_SUPABASE_URL=https://qjrkpntgukymzwegfgqe.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGci...
//   VITE_PIN_RESET_SECRET=your_secret_here
//   VITE_SHOP_UPI_ID=yourname@bank
//
// Vercel: add the same keys in Project Settings → Environment Variables
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  SHOP_NAME:    'The Turtles Cafe',
  SHOP_ADDRESS: 'P-38, Block M, Duplex Flats, Sector 23, Sanjay Nagar, Ghaziabad, Uttar Pradesh - 201017',
  SHOP_PHONE:   '9650814612',
  GSTIN:        '',

  GST_RATE:                5 as 5 | 18,
  GST_MODE:                'exclusive' as 'exclusive' | 'inclusive',
  SERVICE_CHARGE_PERCENT:  0,

  INVOICE_PREFIX:  'TTC',
  CURRENCY_SYMBOL: '₹',
  DATE_FORMAT:     'DD/MM/YY' as const,

  PAPER_SIZE:   '58mm' as const,
  PRINT_COPIES: 2 as 1 | 2 | 3,

  PIN_MAX_ATTEMPTS:    5,
  PIN_LOCK_DURATION_MS: 5 * 60 * 1000,

  FY_START_MONTH: 3,

  // ── Secure values — from environment variables ─────────────────────────────
  SUPABASE_URL:      (import.meta.env.VITE_SUPABASE_URL      as string) ?? '',
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? '',
  PIN_RESET_SECRET:  (import.meta.env.VITE_PIN_RESET_SECRET  as string) ?? 'change_this',
  SHOP_UPI_ID:       (import.meta.env.VITE_SHOP_UPI_ID       as string) ?? '',
} as const;

export function getCurrentFY(): string {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const start = month >= CONFIG.FY_START_MONTH ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function getCurrentFYStart(): Date {
  const now  = new Date();
  const year = now.getMonth() >= CONFIG.FY_START_MONTH
    ? now.getFullYear()
    : now.getFullYear() - 1;
  return new Date(year, CONFIG.FY_START_MONTH, 1, 0, 0, 0, 0);
}
