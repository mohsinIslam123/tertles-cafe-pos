import { CONFIG } from '../config';
import { formatCurrency, formatDate } from './format';

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML shell for all PDF-printable reports
// ─────────────────────────────────────────────────────────────────────────────

function reportShell(title: string, rangeLabel: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)} — ${esc(CONFIG.SHOP_NAME)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
  .header { border-bottom: 2px solid #1a4731; padding-bottom: 10px; margin-bottom: 14px; }
  .shop-name { font-size: 20px; font-weight: bold; color: #1a4731; }
  .report-title { font-size: 14px; font-weight: bold; margin-top: 4px; }
  .report-range { font-size: 11px; color: #666; margin-top: 2px; }
  h3 { font-size: 12px; font-weight: bold; margin: 14px 0 6px; color: #1a4731; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
  th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-weight: bold; border: 1px solid #e5e7eb; }
  td { padding: 4px 8px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #fafafa; }
  .num { text-align: right; font-family: monospace; }
  .total-row td { font-weight: bold; background: #f0fdf4 !important; }
  .stat-grid { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .stat-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; min-width: 130px; }
  .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
  .stat-value { font-size: 18px; font-weight: bold; color: #1a4731; margin-top: 2px; }
  .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { padding: 10px; } @page { margin: 15mm; } }
</style>
</head>
<body>
<div class="header">
  <div class="shop-name">${esc(CONFIG.SHOP_NAME)}</div>
  <div class="report-title">${esc(title)}</div>
  <div class="report-range">${esc(rangeLabel)} · GSTIN: ${esc(CONFIG.GSTIN)} · Ph: ${esc(CONFIG.SHOP_PHONE)}</div>
</div>
${bodyHtml}
<div class="footer">Generated: ${new Date().toLocaleString('en-IN')} · ${esc(CONFIG.SHOP_NAME)} POS</div>
<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>
</body>
</html>`;
}

export function openReportPrint(title: string, rangeLabel: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=860,height=700');
  if (!win) { alert('Allow pop-ups for this site to use PDF export.'); return; }
  win.document.write(reportShell(title, rangeLabel, bodyHtml));
  win.document.close();
}

export function shareWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales report
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesDailyRow { date: Date; bills: number; sales: number; }

export interface SalesExportData {
  totalSales: number;
  billCount: number;
  avgBill: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  daily: SalesDailyRow[];
}

export function exportSalesPdf(data: SalesExportData, rangeLabel: string): void {
  const dailyRows = data.daily.map(d => `
    <tr>
      <td>${formatDate(d.date)}</td>
      <td class="num">${d.bills}</td>
      <td class="num">${formatCurrency(d.sales)}</td>
      <td class="num">${d.bills > 0 ? formatCurrency(d.sales / d.bills) : '—'}</td>
    </tr>
  `).join('');

  const body = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total Sales</div><div class="stat-value">${formatCurrency(data.totalSales)}</div></div>
      <div class="stat-card"><div class="stat-label">Bills</div><div class="stat-value">${data.billCount}</div></div>
      <div class="stat-card"><div class="stat-label">Avg Bill</div><div class="stat-value">${formatCurrency(data.avgBill)}</div></div>
      <div class="stat-card"><div class="stat-label">Cash</div><div class="stat-value">${formatCurrency(data.cashSales)}</div></div>
      <div class="stat-card"><div class="stat-label">UPI</div><div class="stat-value">${formatCurrency(data.upiSales)}</div></div>
      <div class="stat-card"><div class="stat-label">Card</div><div class="stat-value">${formatCurrency(data.cardSales)}</div></div>
    </div>
    <h3>Daily Breakdown</h3>
    <table>
      <thead><tr><th>Date</th><th class="num">Bills</th><th class="num">Sales</th><th class="num">Avg/Bill</th></tr></thead>
      <tbody>${dailyRows}</tbody>
      <tfoot><tr class="total-row"><td>TOTAL</td><td class="num">${data.billCount}</td><td class="num">${formatCurrency(data.totalSales)}</td><td class="num">${formatCurrency(data.avgBill)}</td></tr></tfoot>
    </table>`;

  openReportPrint('Sales Report', rangeLabel, body);
}

export function salesWhatsApp(data: SalesExportData, rangeLabel: string): string {
  return `*${CONFIG.SHOP_NAME} — Sales Report*
📅 ${rangeLabel}

💰 Total Sales: ${formatCurrency(data.totalSales)}
🧾 Bills: ${data.billCount}
📊 Avg Bill: ${formatCurrency(data.avgBill)}

💵 Cash: ${formatCurrency(data.cashSales)}
📱 UPI: ${formatCurrency(data.upiSales)}
💳 Card: ${formatCurrency(data.cardSales)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item performance report
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemRow { name: string; code: string; qty: number; revenue: number; }

export interface ItemExportData {
  topByRevenue: ItemRow[];
  topByQty: ItemRow[];
  deadStock: { name: string; code: string }[];
}

export function exportItemsPdf(data: ItemExportData, rangeLabel: string): void {
  const revenueRows = data.topByRevenue.map((r, i) => `
    <tr><td>${i + 1}. ${esc(r.name)}</td><td>${esc(r.code)}</td>
    <td class="num">${r.qty}</td><td class="num">${formatCurrency(r.revenue)}</td></tr>
  `).join('');

  const qtyRows = data.topByQty.map((r, i) => `
    <tr><td>${i + 1}. ${esc(r.name)}</td><td>${esc(r.code)}</td>
    <td class="num">${r.qty}</td><td class="num">${formatCurrency(r.revenue)}</td></tr>
  `).join('');

  const deadRows = data.deadStock.length > 0
    ? data.deadStock.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.code)}</td><td>No sales in period</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#6b7280">All items sold in this period</td></tr>';

  const body = `
    <h3>Top Items by Revenue</h3>
    <table><thead><tr><th>Item</th><th>Code</th><th class="num">Qty</th><th class="num">Revenue</th></tr></thead>
    <tbody>${revenueRows}</tbody></table>
    <h3>Top Items by Quantity</h3>
    <table><thead><tr><th>Item</th><th>Code</th><th class="num">Qty</th><th class="num">Revenue</th></tr></thead>
    <tbody>${qtyRows}</tbody></table>
    <h3>Dead Stock (No Sales)</h3>
    <table><thead><tr><th>Item</th><th>Code</th><th>Status</th></tr></thead>
    <tbody>${deadRows}</tbody></table>`;

  openReportPrint('Item Performance Report', rangeLabel, body);
}

export function itemsWhatsApp(data: ItemExportData, rangeLabel: string): string {
  const top5 = data.topByRevenue.slice(0, 5)
    .map((r, i) => `${i + 1}. ${r.name} — ${formatCurrency(r.revenue)} (${r.qty} sold)`)
    .join('\n');
  return `*${CONFIG.SHOP_NAME} — Top Items*
📅 ${rangeLabel}

🏆 By Revenue:
${top5}

💀 Dead Stock: ${data.deadStock.length} item${data.deadStock.length !== 1 ? 's' : ''} with no sales`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GST report
// ─────────────────────────────────────────────────────────────────────────────

export interface GSTInvoiceRow {
  number: string;
  date: Date;
  customer: string;
  taxableForGST: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface GSTExportData {
  invoices: GSTInvoiceRow[];
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalGST: number;
  totalInvoices: number;
}

export function exportGSTPdf(data: GSTExportData, rangeLabel: string): void {
  const rows = data.invoices.map(inv => `
    <tr>
      <td class="num">${esc(inv.number)}</td>
      <td>${formatDate(inv.date)}</td>
      <td>${esc(inv.customer || '—')}</td>
      <td class="num">${formatCurrency(inv.taxableForGST)}</td>
      <td class="num">${formatCurrency(inv.cgst)}</td>
      <td class="num">${formatCurrency(inv.sgst)}</td>
      <td class="num">${formatCurrency(inv.total)}</td>
    </tr>
  `).join('');

  const body = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Taxable Turnover</div><div class="stat-value">${formatCurrency(data.totalTaxable)}</div></div>
      <div class="stat-card"><div class="stat-label">Total CGST</div><div class="stat-value">${formatCurrency(data.totalCGST)}</div></div>
      <div class="stat-card"><div class="stat-label">Total SGST</div><div class="stat-value">${formatCurrency(data.totalSGST)}</div></div>
      <div class="stat-card"><div class="stat-label">Total GST</div><div class="stat-value">${formatCurrency(data.totalGST)}</div></div>
      <div class="stat-card"><div class="stat-label">Invoices</div><div class="stat-value">${data.totalInvoices}</div></div>
    </div>
    <h3>Invoice-wise GST Breakdown</h3>
    <p style="font-size:10px;color:#6b7280;margin-bottom:6px">GST Rate: ${CONFIG.GST_RATE}% (CGST ${CONFIG.GST_RATE / 2}% + SGST ${CONFIG.GST_RATE / 2}%) · Mode: ${CONFIG.GST_MODE}</p>
    <table>
      <thead><tr>
        <th>Invoice #</th><th>Date</th><th>Customer</th>
        <th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row">
        <td colspan="3">TOTALS (${data.totalInvoices} invoices)</td>
        <td class="num">${formatCurrency(data.totalTaxable)}</td>
        <td class="num">${formatCurrency(data.totalCGST)}</td>
        <td class="num">${formatCurrency(data.totalSGST)}</td>
        <td class="num">${formatCurrency(data.totalTaxable + data.totalGST)}</td>
      </tr></tfoot>
    </table>
    <p style="font-size:10px;color:#9ca3af;margin-top:8px">This report is for reference. Verify with your CA before filing GSTR-1.</p>`;

  openReportPrint('GST Report', rangeLabel, body);
}

export function gstWhatsApp(data: GSTExportData, rangeLabel: string): string {
  return `*${CONFIG.SHOP_NAME} — GST Summary*
📅 ${rangeLabel}
GSTIN: ${CONFIG.GSTIN}

📊 Taxable Turnover: ${formatCurrency(data.totalTaxable)}
🏛️ CGST (${CONFIG.GST_RATE / 2}%): ${formatCurrency(data.totalCGST)}
🏛️ SGST (${CONFIG.GST_RATE / 2}%): ${formatCurrency(data.totalSGST)}
💰 Total GST: ${formatCurrency(data.totalGST)}
🧾 Invoices: ${data.totalInvoices}

_For CA reference only. Verify before filing._`;
}
