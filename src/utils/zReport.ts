import { CONFIG } from '../config';
import { formatCurrency, formatDate, formatDateTime } from './format';

// ─────────────────────────────────────────────────────────────────────────────
// Z Report data shape
// ─────────────────────────────────────────────────────────────────────────────

export interface ZReportData {
  date: Date;
  closedAt: Date;
  openingCash: number;
  totalSales: number;
  billCount: number;
  cancelledCount: number;
  cashSales: number;  cashCount: number;
  upiSales: number;   upiCount: number;
  cardSales: number;  cardCount: number;
  expectedCash: number;  // openingCash + cashSales
  closingCash: number;
  variance: number;      // expectedCash - closingCash (negative = shortage)
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS Z report (58mm)
// ─────────────────────────────────────────────────────────────────────────────

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
const ENC = new TextEncoder();

function bytes(...args: number[]): number[] { return args; }
function text(s: string): number[] {
  return [...ENC.encode(s.replace(/₹/g, 'Rs.').replace(/[^\x00-\x7F]/g, '?'))];
}
function line(s = ''): number[] { return [...text(s), LF]; }
function divider(ch: string, n = 32): number[] { return line(ch.repeat(n)); }
function center(s: string, n = 32): number[] {
  const pad = Math.max(0, Math.floor((n - s.length) / 2));
  return line(' '.repeat(pad) + s);
}
function twoCol(label: string, value: string, w = 32): number[] {
  const gap = Math.max(1, w - label.length - value.length);
  return line(label + ' '.repeat(gap) + value);
}
function bold(on: boolean): number[] { return bytes(ESC, 0x45, on ? 1 : 0); }
function alignCenter(): number[] { return bytes(ESC, 0x61, 1); }
function alignLeft(): number[] { return bytes(ESC, 0x61, 0); }
function doubleHeight(on: boolean): number[] { return bytes(GS, 0x21, on ? 0x01 : 0x00); }
function cut(): number[] { return bytes(GS, 0x56, 0x42, 0x00); }

export function buildZReportBytes(d: ZReportData): Uint8Array {
  const buf: number[] = [ESC, 0x40]; // init

  buf.push(...alignCenter());
  buf.push(...bold(true), ...doubleHeight(true), ...line(CONFIG.SHOP_NAME), ...doubleHeight(false));
  buf.push(...line('Z REPORT'), ...bold(false));
  buf.push(...line(formatDate(d.date)));
  buf.push(...divider('='));

  buf.push(...alignLeft());
  buf.push(...bold(true), ...line('SALES SUMMARY'), ...bold(false));
  buf.push(...twoCol('Total Sales:', `Rs.${d.totalSales.toFixed(2)}`));
  buf.push(...twoCol('Bills:', String(d.billCount)));
  if (d.cancelledCount > 0) buf.push(...twoCol('Cancelled:', String(d.cancelledCount)));
  buf.push(...twoCol('Avg Bill:', d.billCount > 0 ? `Rs.${(d.totalSales / d.billCount).toFixed(2)}` : '—'));
  buf.push(...divider('-'));

  buf.push(...bold(true), ...line('PAYMENT BREAKDOWN'), ...bold(false));
  if (d.cashCount > 0)  buf.push(...twoCol(`Cash (${d.cashCount}):`,  `Rs.${d.cashSales.toFixed(2)}`));
  if (d.upiCount > 0)   buf.push(...twoCol(`UPI (${d.upiCount}):`,   `Rs.${d.upiSales.toFixed(2)}`));
  if (d.cardCount > 0)  buf.push(...twoCol(`Card (${d.cardCount}):`, `Rs.${d.cardSales.toFixed(2)}`));
  buf.push(...divider('-'));

  buf.push(...bold(true), ...line('CASH RECONCILIATION'), ...bold(false));
  buf.push(...twoCol('Opening Cash:', `Rs.${d.openingCash.toFixed(2)}`));
  buf.push(...twoCol('Cash Sales:', `Rs.${d.cashSales.toFixed(2)}`));
  buf.push(...twoCol('Expected:', `Rs.${d.expectedCash.toFixed(2)}`));
  buf.push(...twoCol('Closing Cash:', `Rs.${d.closingCash.toFixed(2)}`));
  buf.push(...bold(true));
  const varianceStr = `${d.variance >= 0 ? '+' : ''}Rs.${d.variance.toFixed(2)}`;
  buf.push(...twoCol('Variance:', varianceStr));
  buf.push(...bold(false));

  if (d.notes) {
    buf.push(...divider('-'));
    buf.push(...line('Notes:'));
    buf.push(...line(d.notes.substring(0, 32)));
  }

  buf.push(...divider('='));
  buf.push(...alignCenter());
  buf.push(...line(`Closed: ${formatDateTime(d.closedAt)}`));
  buf.push(LF, LF, LF);
  buf.push(...cut());

  return new Uint8Array(buf);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Z report — opens in new window, triggers print dialog
// ─────────────────────────────────────────────────────────────────────────────

export function printZReportHtml(d: ZReportData): void {
  const avgBill = d.billCount > 0 ? d.totalSales / d.billCount : 0;

  const payRows = [
    d.cashCount > 0 ? `<tr><td>Cash (${d.cashCount} bills)</td><td class="num">${formatCurrency(d.cashSales)}</td></tr>` : '',
    d.upiCount  > 0 ? `<tr><td>UPI (${d.upiCount} bills)</td><td class="num">${formatCurrency(d.upiSales)}</td></tr>`   : '',
    d.cardCount > 0 ? `<tr><td>Card (${d.cardCount} bills)</td><td class="num">${formatCurrency(d.cardSales)}</td></tr>` : '',
  ].join('');

  const varianceColor = d.variance === 0 ? '#166534' : d.variance > 0 ? '#1d4ed8' : '#dc2626';
  const varianceLabel = d.variance === 0 ? 'Balanced ✓' : d.variance > 0 ? 'Surplus' : 'Shortage';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Z Report — ${formatDate(d.date)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; font-size:12px; width:72mm; margin:0 auto; padding:6mm; }
  .center { text-align:center; }
  .shop { font-size:16px; font-weight:bold; }
  .title { font-size:13px; font-weight:bold; margin-top:4px; }
  .divider { border-top:1px dashed #000; margin:6px 0; }
  .divider-solid { border-top:1px solid #000; margin:6px 0; }
  section h3 { font-size:11px; font-weight:bold; text-transform:uppercase; margin:8px 0 4px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:2px 0; font-size:11px; }
  .num { text-align:right; font-family:monospace; }
  .total td { font-weight:bold; border-top:1px solid #000; padding-top:3px; }
  .variance { border:2px solid ${varianceColor}; border-radius:4px; padding:6px 10px; margin:8px 0; text-align:center; }
  .variance .label { font-size:10px; color:${varianceColor}; font-weight:bold; }
  .variance .amount { font-size:20px; font-weight:bold; color:${varianceColor}; }
  .footer { margin-top:12px; font-size:9px; color:#9ca3af; text-align:center; }
  @media print { @page { size:72mm auto; margin:0; } }
</style></head><body>
<div class="center">
  <div class="shop">${CONFIG.SHOP_NAME}</div>
  <div class="title">── Z REPORT ──</div>
  <div style="font-size:11px;margin-top:3px">${formatDate(d.date)}</div>
</div>
<div class="divider-solid"></div>

<section>
  <h3>Sales Summary</h3>
  <table>
    <tr><td>Total Sales</td><td class="num">${formatCurrency(d.totalSales)}</td></tr>
    <tr><td>Bills</td><td class="num">${d.billCount}</td></tr>
    ${d.cancelledCount > 0 ? `<tr><td>Cancelled</td><td class="num">${d.cancelledCount}</td></tr>` : ''}
    <tr><td>Avg Bill</td><td class="num">${formatCurrency(avgBill)}</td></tr>
  </table>
</section>

<div class="divider"></div>
<section>
  <h3>Payment Breakdown</h3>
  <table>
    ${payRows}
    <tr class="total"><td>Total</td><td class="num">${formatCurrency(d.totalSales)}</td></tr>
  </table>
</section>

<div class="divider"></div>
<section>
  <h3>Cash Reconciliation</h3>
  <table>
    <tr><td>Opening Cash</td><td class="num">${formatCurrency(d.openingCash)}</td></tr>
    <tr><td>Cash Sales</td><td class="num">+ ${formatCurrency(d.cashSales)}</td></tr>
    <tr class="total"><td>Expected Cash</td><td class="num">${formatCurrency(d.expectedCash)}</td></tr>
    <tr><td>Closing Cash (counted)</td><td class="num">${formatCurrency(d.closingCash)}</td></tr>
  </table>
  <div class="variance">
    <div class="label">${varianceLabel}</div>
    <div class="amount">${d.variance >= 0 ? '+' : ''}${formatCurrency(Math.abs(d.variance))}</div>
  </div>
</section>

${d.notes ? `<div class="divider"></div><section><h3>Notes</h3><p style="font-size:11px">${d.notes}</p></section>` : ''}

<div class="divider-solid"></div>
<div class="footer">
  Closed: ${formatDateTime(d.closedAt)}<br/>
  ${CONFIG.SHOP_NAME} · GSTIN: ${CONFIG.GSTIN}
</div>

<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) { alert('Allow pop-ups to print Z report.'); return; }
  win.document.write(html);
  win.document.close();
}
