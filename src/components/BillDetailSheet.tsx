import { useState, useEffect } from 'react';
import { db, type Invoice, type InvoiceItem, type Customer } from '../db';
import { formatCurrency, formatDateTime } from '../utils/format';
import { CONFIG } from '../config';
import { usePrinterStore } from '../stores/printerStore';
import PrintResultSheet from './PrintResultSheet';
import CancelBillSheet from './CancelBillSheet';

// ── WhatsApp receipt text ─────────────────────────────────────────────────────

function buildWaText(
  invoice: Invoice,
  items: InvoiceItem[],
  customerName: string | null,
): string {
  const sep  = '─'.repeat(32);
  const dsep = '═'.repeat(32);
  const lines: string[] = [];

  lines.push(`*${CONFIG.SHOP_NAME}*`);
  lines.push(CONFIG.SHOP_ADDRESS);
  lines.push(`Ph: ${CONFIG.SHOP_PHONE}`);
  if (CONFIG.GSTIN !== 'XXXXXXXXXXXX') lines.push(`GSTIN: ${CONFIG.GSTIN}`);
  lines.push(dsep);
  lines.push(`Invoice: ${invoice.invoice_number}`);
  lines.push(`Date: ${formatDateTime(invoice.created_at)}`);
  if (customerName) lines.push(`Customer: ${customerName}`);
  lines.push(sep);

  items.forEach(it => {
    const amt = (it.price_snapshot * it.qty - it.item_discount).toFixed(2);
    lines.push(`${it.item_name_snapshot}`);
    lines.push(`  ${it.qty} × ₹${it.price_snapshot} = ₹${amt}`);
    if (it.item_discount > 0) lines.push(`  Disc: -₹${it.item_discount.toFixed(2)}`);
  });

  lines.push(sep);
  lines.push(`Subtotal: ₹${invoice.subtotal.toFixed(2)}`);
  if (invoice.item_discount_total > 0) lines.push(`Item Disc: -₹${invoice.item_discount_total.toFixed(2)}`);
  if (invoice.service_charge > 0) lines.push(`Service: +₹${invoice.service_charge.toFixed(2)}`);
  if (invoice.cgst > 0) {
    lines.push(`CGST ${CONFIG.GST_RATE / 2}%: ₹${invoice.cgst.toFixed(2)}`);
    lines.push(`SGST ${CONFIG.GST_RATE / 2}%: ₹${invoice.sgst.toFixed(2)}`);
  }
  lines.push(dsep);
  lines.push(`*TOTAL: ₹${invoice.total}*`);
  lines.push(dsep);
  lines.push(`Payment: ${invoice.payment_mode.toUpperCase()}`);
  if (invoice.payment_mode === 'cash' && invoice.cash_received > 0) {
    lines.push(`Cash: ₹${invoice.cash_received} | Change: ₹${invoice.change_given}`);
  }
  lines.push('');
  lines.push('_Thank you, visit again!_ 🐢');
  return lines.join('\n');
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value, bold = false, green = false, red = false }: {
  label: string; value: string; bold?: boolean; green?: boolean; red?: boolean;
}) {
  if (!value || value === '₹0.00' || value === '₹0') return null;
  return (
    <div className="flex justify-between items-center py-1">
      <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm font-semibold font-mono ${bold ? 'text-brand-700' : green ? 'text-green-600' : red ? 'text-red-500' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface BillDetailSheetProps {
  invoiceId: number | null;
  onClose: () => void;
}

interface BillData {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer | null;
}

export default function BillDetailSheet({ invoiceId, onClose }: BillDetailSheetProps) {
  const [data, setData]               = useState<BillData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);

  const { status, lastError, printInvoice, retryPrint, printFallback } = usePrinterStore(s => ({
    status:       s.status,
    lastError:    s.lastError,
    printInvoice: s.printInvoice,
    retryPrint:   s.retryPrint,
    printFallback:s.printFallback,
  }));

  const open = invoiceId !== null;

  useEffect(() => {
    if (!open || !invoiceId) { setData(null); return; }
    setLoading(true);

    Promise.all([
      db.invoices.get(invoiceId),
      db.invoice_items.where('invoice_id').equals(invoiceId).toArray(),
    ]).then(async ([invoice, items]) => {
      if (!invoice) { setData(null); setLoading(false); return; }
      const customer = invoice.customer_id
        ? await db.customers.get(invoice.customer_id) ?? null
        : null;
      setData({ invoice, items, customer });
    }).finally(() => setLoading(false));
  }, [invoiceId, open]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const handlePrint = () => {
    if (!data) return;
    setPrintSheetOpen(true);
    printInvoice(data.invoice);
  };

  const handleWhatsApp = () => {
    if (!data) return;
    const text = buildWaText(data.invoice, data.items, data.customer?.name ?? null);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCancelled = (updated: Invoice) => {
    if (data) setData({ ...data, invoice: updated });
    setCancelSheetOpen(false);
  };

  const inv      = data?.invoice;
  const items    = data?.items ?? [];
  const customer = data?.customer ?? null;
  const isCancelled = inv?.status === 'cancelled';

  const modeIcon: Record<string, string> = { cash: '💵', upi: '📱', card: '💳' };
  const modeLabel: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle + header */}
          <div className="flex-none px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900 font-mono">
                    {inv?.invoice_number ?? '…'}
                  </h2>
                  {isCancelled && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                      VOID
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {inv ? formatDateTime(inv.created_at) : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-lg"
              >×</button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="text-center py-10 text-sm text-gray-300">Loading…</div>
            ) : !data ? (
              <div className="text-center py-10 text-sm text-gray-400">Bill not found.</div>
            ) : (
              <>
                {/* Customer */}
                {customer && (
                  <div className="bg-brand-50 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
                    <span className="text-xl">👤</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-500">{customer.phone}</p>
                    </div>
                  </div>
                )}

                {/* Cancel reason */}
                {isCancelled && inv?.cancel_reason && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4">
                    <p className="text-xs font-semibold text-red-600">Cancelled</p>
                    <p className="text-xs text-red-500 mt-0.5">{inv.cancel_reason}</p>
                  </div>
                )}

                {/* Items */}
                <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Items</p>
                  <div className="divide-y divide-gray-100">
                    {items.map(it => (
                      <div key={it.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{it.item_name_snapshot}</p>
                          <p className="text-xs text-gray-400">
                            {it.qty} × {formatCurrency(it.price_snapshot)}
                            {it.item_discount > 0 && (
                              <span className="text-green-600 ml-1">
                                − {formatCurrency(it.item_discount)}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 font-mono">
                          {formatCurrency(it.qty * it.price_snapshot - it.item_discount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Summary</p>
                  <DetailRow label="Subtotal" value={formatCurrency(inv!.subtotal)} />
                  <DetailRow label="Item Discounts" value={formatCurrency(inv!.item_discount_total)} green />
                  {inv!.bill_discount_value > 0 && (
                    <DetailRow
                      label={inv!.bill_discount_type === 'percent'
                        ? `Bill Discount (${inv!.bill_discount_value}%)`
                        : 'Bill Discount'}
                      value={formatCurrency(inv!.subtotal - inv!.item_discount_total - inv!.taxable_amount - inv!.service_charge)}
                      green
                    />
                  )}
                  {inv!.service_charge > 0 && (
                    <DetailRow label={`Service Charge (${CONFIG.SERVICE_CHARGE_PERCENT}%)`} value={formatCurrency(inv!.service_charge)} />
                  )}
                  {inv!.cgst > 0 && (
                    <>
                      <DetailRow label={`CGST (${CONFIG.GST_RATE / 2}%)`} value={formatCurrency(inv!.cgst)} />
                      <DetailRow label={`SGST (${CONFIG.GST_RATE / 2}%)`} value={formatCurrency(inv!.sgst)} />
                    </>
                  )}
                  {inv!.round_off !== 0 && (
                    <DetailRow
                      label="Round Off"
                      value={`${inv!.round_off > 0 ? '+' : ''}${formatCurrency(Math.abs(inv!.round_off))}`}
                    />
                  )}
                  <div className="border-t border-gray-200 mt-2 pt-2">
                    <DetailRow label="TOTAL" value={formatCurrency(inv!.total)} bold />
                  </div>
                </div>

                {/* Payment */}
                <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{modeIcon[inv!.payment_mode]}</span>
                    <span className="text-sm font-semibold text-gray-900">{modeLabel[inv!.payment_mode]}</span>
                  </div>
                  {inv!.payment_mode === 'cash' && inv!.cash_received > 0 && (
                    <div className="mt-2">
                      <DetailRow label="Cash Received" value={formatCurrency(inv!.cash_received)} />
                      <DetailRow label="Change" value={formatCurrency(inv!.change_given)} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          {data && (
            <div className="flex-none px-5 py-4 border-t border-gray-100 bg-white">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={handlePrint}
                  className="flex-1 h-11 bg-gray-900 text-white rounded-2xl font-semibold text-sm
                             flex items-center justify-center gap-1.5 active:bg-gray-800"
                >
                  🖨️ Reprint
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="flex-1 h-11 bg-green-500 text-white rounded-2xl font-semibold text-sm
                             flex items-center justify-center gap-1.5 active:bg-green-600"
                >
                  💬 WhatsApp
                </button>
                {!isCancelled && (
                  <button
                    onClick={() => setCancelSheetOpen(true)}
                    className="flex-1 h-11 bg-red-50 text-red-500 rounded-2xl font-semibold text-sm
                               flex items-center justify-center gap-1.5 active:bg-red-100 border border-red-200"
                  >
                    🚫 Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub-sheets — higher z so they stack on top */}
      <PrintResultSheet
        open={printSheetOpen}
        status={status}
        lastError={lastError}
        copies={CONFIG.PRINT_COPIES}
        onRetry={retryPrint}
        onPdfFallback={() => { setPrintSheetOpen(false); if (data) printFallback(data.invoice); }}
        onClose={() => setPrintSheetOpen(false)}
      />

      <CancelBillSheet
        invoice={cancelSheetOpen ? inv ?? null : null}
        onCancelled={handleCancelled}
        onClose={() => setCancelSheetOpen(false)}
      />
    </>
  );
}
