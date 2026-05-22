import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Invoice, InvoiceItem } from '../db';
import { CONFIG } from '../config';
import { formatCurrency, formatDateTime } from '../utils/format';
import { usePrinterStore } from '../stores/printerStore';
import PrintResultSheet from './PrintResultSheet';

interface SaveSuccessSheetProps {
  invoice: Invoice | null;
  items: InvoiceItem[];
  onClose: () => void;
}

function buildReceiptText(invoice: Invoice, items: InvoiceItem[]): string {
  const lines: string[] = [];
  const sep  = '─'.repeat(32);
  const dsep = '═'.repeat(32);

  lines.push(`*${CONFIG.SHOP_NAME}*`);
  lines.push(CONFIG.SHOP_ADDRESS);
  lines.push(`Ph: ${CONFIG.SHOP_PHONE}`);
  if (CONFIG.GSTIN !== 'XXXXXXXXXXXX') lines.push(`GSTIN: ${CONFIG.GSTIN}`);
  lines.push(dsep);
  lines.push(`Invoice: ${invoice.invoice_number}`);
  lines.push(`Date: ${formatDateTime(invoice.created_at)}`);
  lines.push(sep);

  items.forEach(it => {
    const lineAmt = (it.price_snapshot * it.qty - it.item_discount).toFixed(2);
    lines.push(`${it.item_name_snapshot}`);
    lines.push(`  ${it.qty} × ₹${it.price_snapshot.toFixed(2)} = ₹${lineAmt}`);
    if (it.item_discount > 0) lines.push(`  Disc: -₹${it.item_discount.toFixed(2)}`);
  });

  lines.push(sep);
  lines.push(`Subtotal:        ₹${invoice.subtotal.toFixed(2)}`);
  if (invoice.item_discount_total > 0) lines.push(`Item Disc:      -₹${invoice.item_discount_total.toFixed(2)}`);
  if (invoice.bill_discount_value > 0) {
    const label = invoice.bill_discount_type === 'percent'
      ? `Bill Disc ${invoice.bill_discount_value}%:`
      : 'Bill Discount:';
    lines.push(`${label}`);
  }
  if (invoice.service_charge > 0) lines.push(`Service Chg:    +₹${invoice.service_charge.toFixed(2)}`);
  if (invoice.cgst > 0) {
    lines.push(`CGST ${CONFIG.GST_RATE / 2}%:       ₹${invoice.cgst.toFixed(2)}`);
    lines.push(`SGST ${CONFIG.GST_RATE / 2}%:       ₹${invoice.sgst.toFixed(2)}`);
  }
  if (invoice.round_off !== 0) lines.push(`Round Off:      ${invoice.round_off > 0 ? '+' : ''}₹${invoice.round_off.toFixed(2)}`);
  lines.push(dsep);
  lines.push(`*TOTAL:          ₹${invoice.total}*`);
  lines.push(dsep);
  lines.push(`Payment: ${invoice.payment_mode.toUpperCase()}`);
  if (invoice.payment_mode === 'cash' && invoice.cash_received > 0) {
    lines.push(`Cash Received:  ₹${invoice.cash_received}`);
    lines.push(`Change:         ₹${invoice.change_given}`);
  }
  lines.push('');
  lines.push('_Thank you, visit again!_ 🐢');

  return lines.join('\n');
}

export default function SaveSuccessSheet({ invoice, items, onClose }: SaveSuccessSheetProps) {
  const navigate = useNavigate();
  const { status, lastError, deviceName, isPaired, printInvoice, retryPrint, printFallback, isSupported } =
    usePrinterStore(s => ({
      status:       s.status,
      lastError:    s.lastError,
      deviceName:   s.deviceName,
      isPaired:     s.status !== 'unpaired',
      printInvoice: s.printInvoice,
      retryPrint:   s.retryPrint,
      printFallback:s.printFallback,
      isSupported:  s.isSupported,
    }));

  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [printTriggered, setPrintTriggered] = useState(false);

  // Auto-print on mount if printer is paired
  useEffect(() => {
    if (!invoice || printTriggered) return;
    if (isPaired && isSupported) {
      setPrintTriggered(true);
      setPrintSheetOpen(true);
      printInvoice(invoice);
    }
  }, [invoice, isPaired]);

  useEffect(() => {
    if (invoice) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [invoice]);

  if (!invoice) return null;

  const handleManualPrint = () => {
    setPrintSheetOpen(true);
    printInvoice(invoice);
  };

  const handleRetry = () => {
    retryPrint();
  };

  const handlePdfFallback = () => {
    setPrintSheetOpen(false);
    printFallback(invoice);
  };

  const handleWhatsApp = () => {
    const text = buildReceiptText(invoice, items);
    const url  = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleNewBill = () => {
    onClose();
    navigate('/bill', { replace: true });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

          {/* Success header */}
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-3xl">
              ✅
            </div>
            <h2 className="text-xl font-bold text-gray-900">Bill Saved!</h2>
            <p className="text-sm text-gray-500 font-mono">{invoice.invoice_number}</p>
            <p className="text-3xl font-bold text-brand-600">{formatCurrency(invoice.total)}</p>

            {invoice.payment_mode === 'cash' && invoice.change_given > 0 && (
              <div className="mt-2 px-5 py-3 bg-amber-50 rounded-2xl text-center w-full">
                <p className="text-xs text-amber-600 font-medium">Return change</p>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(invoice.change_given)}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {/* Print button */}
            {isSupported ? (
              <button
                onClick={handleManualPrint}
                className="w-full h-14 bg-gray-900 text-white rounded-2xl font-semibold text-base
                           flex items-center justify-center gap-2 active:bg-gray-800 shadow-md"
              >
                🖨️ Print Receipt
                {deviceName && (
                  <span className="text-xs text-gray-400 font-normal">· {deviceName}</span>
                )}
                {!isPaired && (
                  <span className="text-xs text-gray-400 font-normal">· No printer paired</span>
                )}
              </button>
            ) : (
              <button
                onClick={() => printFallback(invoice)}
                className="w-full h-14 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-base
                           flex items-center justify-center gap-2 active:bg-gray-200"
              >
                🖥️ Print via Browser
              </button>
            )}

            <button
              onClick={handleWhatsApp}
              className="w-full h-14 bg-green-500 text-white rounded-2xl font-semibold text-base
                         flex items-center justify-center gap-2 active:bg-green-600 shadow-md"
            >
              💬 Share on WhatsApp
            </button>

            <button
              onClick={handleNewBill}
              className="w-full h-14 bg-brand-600 text-white rounded-2xl font-semibold text-base
                         flex items-center justify-center gap-2 active:bg-brand-700 shadow-md"
            >
              + New Bill
            </button>

            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-400 text-center py-2"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Print result overlay */}
      <PrintResultSheet
        open={printSheetOpen}
        status={status}
        lastError={lastError}
        copies={CONFIG.PRINT_COPIES}
        onRetry={handleRetry}
        onPdfFallback={handlePdfFallback}
        onClose={() => setPrintSheetOpen(false)}
      />
    </>
  );
}
