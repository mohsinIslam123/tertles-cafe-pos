import { CONFIG } from '../config';

/** ₹1,234.50 */
export function formatCurrency(amount: number): string {
  return (
    CONFIG.CURRENCY_SYMBOL +
    Math.abs(amount)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

/** ₹1,235 (rounded, no decimals — for display in totals) */
export function formatCurrencyRounded(amount: number): string {
  return (
    CONFIG.CURRENCY_SYMBOL +
    Math.round(Math.abs(amount))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

/** 21/05/26 */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(2);
  return `${d}/${m}/${y}`;
}

/** 21/05/26 02:21 PM */
export function formatDateTime(date: Date): string {
  const datePart = formatDate(date);
  let h = date.getHours();
  const min = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${datePart} ${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

/** "Today", "Yesterday", or "21/05/26" */
export function formatRelativeDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return formatDate(date);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "YYYY-MM-DD" for day_closes.date field */
export function toISODateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Start of today (midnight) */
export function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of today (23:59:59.999) */
export function todayEnd(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Start of current week (Monday) */
export function weekStart(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** MM:SS countdown string from milliseconds */
export function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
