export const CONFIG = {
  SHOP_NAME: 'The Turtles Cafe',
  SHOP_ADDRESS: 'P-38, Block M, Duplex Flats, Sector 23, Sanjay Nagar, Ghaziabad, Uttar Pradesh - 201017',
  SHOP_PHONE: '9650814612',
  GSTIN: '',

  GST_RATE: 5 as 5 | 18,
  GST_MODE: 'exclusive' as 'exclusive' | 'inclusive',
  SERVICE_CHARGE_PERCENT: 0,

  INVOICE_PREFIX: 'TTC',
  CURRENCY_SYMBOL: '₹',
  DATE_FORMAT: 'DD/MM/YY' as const,

  PAPER_SIZE: '58mm' as const,
  PRINT_COPIES: 2 as 1 | 2 | 3,

  PIN_MAX_ATTEMPTS: 5,
  PIN_LOCK_DURATION_MS: 5 * 60 * 1000,
  PIN_RESET_SECRET: '2323',

  FY_START_MONTH: 3,

  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
} as const;

export function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= CONFIG.FY_START_MONTH ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function getCurrentFYStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= CONFIG.FY_START_MONTH
    ? now.getFullYear()
    : now.getFullYear() - 1;
  return new Date(year, CONFIG.FY_START_MONTH, 1, 0, 0, 0, 0);
}