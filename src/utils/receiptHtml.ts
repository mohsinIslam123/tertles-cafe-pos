import type { ReceiptData } from './escpos';
import { CONFIG } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Generates a styled HTML receipt and opens it in a new window.
// User can use Chrome's "Print → Save as PDF" for a PDF copy.
// ─────────────────────────────────────────────────────────────────────────────

export function printReceiptHtml(data: ReceiptData): void {
  const rows = data.items.map(item => {
    const lineAmt = (item.qty * item.rate - item.itemDiscount).toFixed(2);
    return `
      <tr>
        <td class="name">${esc(item.name)}</td>
        <td class="num">${item.qty}</td>
        <td class="num">₹${item.rate}</td>
        <td class="num">₹${lineAmt}</td>
      </tr>
      ${item.itemDiscount > 0 ? `<tr class="disc-row"><td colspan="3" class="disc-label">Item disc</td><td class="num green">-₹${item.itemDiscount.toFixed(2)}</td></tr>` : ''}
    `;
  }).join('');

  const totalLine = (label: string, amount: string, bold = false, green = false) => `
    <div class="total-row${bold ? ' bold' : ''}${green ? ' green' : ''}">
      <span>${esc(label)}</span><span>₹${amount}</span>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${data.invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 72mm;
    margin: 0 auto;
    padding: 4mm;
    color: #000;
  }
  .center  { text-align: center; }
  .shop-name { font-size: 16px; font-weight: bold; }
  .divider { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .divider-solid { border-top: 1px solid #000; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 1px 0; }
  td.name { width: 45%; }
  td.num  { width: 18%; text-align: right; }
  th      { font-weight: bold; border-bottom: 1px solid #000; border-top: 1px solid #000; padding: 2px 0; }
  .disc-row td { font-size: 10px; color: #333; }
  .disc-label { padding-left: 8px; }
  .total-row { display: flex; justify-content: space-between; padding: 1px 0; }
  .total-row.bold { font-weight: bold; font-size: 14px; border-top: 1px solid #000; margin-top: 2px; padding-top: 3px; }
  .green { color: #006600; }
  .total-row.green span { color: #006600; }
  .change-box { border: 2px solid #000; padding: 4px 8px; margin: 6px 0; text-align: center; }
  .change-box .label { font-size: 10px; }
  .change-box .amount { font-size: 20px; font-weight: bold; }
  @media print {
    body { width: 72mm; }
    @page { size: 72mm auto; margin: 0; }
  }
</style>
</head>
<body>
<div class="center">
  <div class="shop-name">${esc(data.shopName)}</div>
  <div>${esc(data.shopAddress)}</div>
  <div>Ph: ${esc(data.shopPhone)}</div>
  ${data.gstin !== 'XXXXXXXXXXXX' ? `<div>GSTIN: ${esc(data.gstin)}</div>` : ''}
</div>
<hr class="divider"/>

<div>Invoice: <strong>${esc(data.invoiceNumber)}</strong></div>
<div>Date: ${esc(data.dateTime)}</div>
${data.customerName ? `<div>Customer: ${esc(data.customerName)}${data.customerPhone ? ` (${esc(data.customerPhone)})` : ''}</div>` : ''}

<hr class="divider"/>
<table>
  <thead>
    <tr>
      <th class="name">Item</th>
      <th class="num">Qty</th>
      <th class="num">Rate</th>
      <th class="num">Amt</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<hr class="divider"/>

${totalLine('Subtotal', data.subtotal.toFixed(2))}
${data.itemDiscountTotal > 0 ? totalLine('Item Discounts', '-' + data.itemDiscountTotal.toFixed(2), false, true) : ''}
${data.billDiscountAmount > 0 && data.billDiscountLabel ? totalLine(data.billDiscountLabel, '-' + data.billDiscountAmount.toFixed(2), false, true) : ''}
${data.serviceCharge > 0 ? totalLine(`Service Charge ${data.serviceChargePercent}%`, data.serviceCharge.toFixed(2)) : ''}
${data.cgst > 0 ? totalLine(`CGST ${data.gstRate / 2}%`, data.cgst.toFixed(2)) : ''}
${data.sgst > 0 ? totalLine(`SGST ${data.gstRate / 2}%`, data.sgst.toFixed(2)) : ''}
${data.roundOff !== 0 ? totalLine('Round Off', (data.roundOff > 0 ? '+' : '-') + Math.abs(data.roundOff).toFixed(2)) : ''}
${totalLine('TOTAL', data.total.toFixed(0), true)}

<hr class="divider"/>
<div>Payment: ${data.paymentMode.toUpperCase()}</div>
${data.paymentMode === 'cash' && data.cashReceived > 0 ? `
  <div class="total-row"><span>Cash Received</span><span>₹${data.cashReceived}</span></div>
  <div class="change-box">
    <div class="label">Return Change</div>
    <div class="amount">₹${data.changeGiven}</div>
  </div>
` : ''}

<hr class="divider-solid"/>
<div class="center">Thank you, visit again! 🐢</div>
<div class="center" style="font-size:9px;color:#999;margin-top:4px">${esc(CONFIG.SHOP_NAME)} · ${esc(data.invoiceNumber)}</div>

<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 400);
  };
</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups for this site to use print fallback.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
