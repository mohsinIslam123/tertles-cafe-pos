import { useState, useEffect } from 'react';
import { db } from '../db';
import { formatCurrency, formatDate } from '../utils/format';
import { exportGSTPdf, gstWhatsApp, shareWhatsApp, type GSTExportData } from '../utils/reportExport';
import { CONFIG } from '../config';

interface GSTTabProps { start: Date; end: Date; rangeLabel: string; }

const PAGE = 50;

export default function GSTTab({ start, end, rangeLabel }: GSTTabProps) {
  const [data, setData]       = useState<GSTExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow]       = useState(PAGE);

  useEffect(() => {
    setLoading(true);
    setShow(PAGE);

    async function load() {
      const invoices = await db.invoices
        .where('created_at').between(start, end, true, true)
        .filter(i => i.status === 'saved')
        .toArray();

      // Build customer name map
      const custIds = new Set(invoices.filter(i => i.customer_id).map(i => i.customer_id!));
      const custList = custIds.size > 0
        ? await db.customers.where('id').anyOf([...custIds]).toArray()
        : [];
      const custMap = new Map(custList.map(c => [c.id!, c.name]));

      const rows = invoices
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(inv => ({
          number:       inv.invoice_number,
          date:         new Date(inv.created_at),
          customer:     inv.customer_id ? (custMap.get(inv.customer_id) ?? '') : '',
          taxableForGST: inv.taxable_amount + inv.service_charge,
          cgst:         inv.cgst,
          sgst:         inv.sgst,
          total:        inv.total,
        }));

      const totalTaxable = rows.reduce((s, r) => s + r.taxableForGST, 0);
      const totalCGST    = rows.reduce((s, r) => s + r.cgst, 0);
      const totalSGST    = rows.reduce((s, r) => s + r.sgst, 0);

      setData({
        invoices:       rows,
        totalTaxable,
        totalCGST,
        totalSGST,
        totalGST:       totalCGST + totalSGST,
        totalInvoices:  rows.length,
      });
    }

    load().finally(() => setLoading(false));
  }, [start, end]);

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (!data || data.totalInvoices === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-2">
        <span className="text-4xl">🧾</span>
        <p className="text-sm text-gray-500 text-center">No invoices in this period.</p>
      </div>
    );
  }

  const shown = data.invoices.slice(0, show);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          GST Summary · Rate {CONFIG.GST_RATE}% ({CONFIG.GST_MODE})
        </p>
        {[
          { label: 'Taxable Turnover',             value: data.totalTaxable, bold: false },
          { label: `CGST @ ${CONFIG.GST_RATE / 2}%`, value: data.totalCGST, bold: false },
          { label: `SGST @ ${CONFIG.GST_RATE / 2}%`, value: data.totalSGST, bold: false },
          { label: 'Total GST Liability',           value: data.totalGST,    bold: true  },
        ].map(row => (
          <div key={row.label} className={`flex justify-between items-center ${row.bold ? 'pt-2 border-t border-gray-100' : ''}`}>
            <span className={`text-sm ${row.bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
              {row.label}
            </span>
            <span className={`text-sm font-mono ${row.bold ? 'font-bold text-brand-700' : 'font-semibold text-gray-900'}`}>
              {formatCurrency(row.value)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-1 text-xs text-gray-400">
          <span>Invoices</span>
          <span className="font-semibold">{data.totalInvoices}</span>
        </div>
      </div>

      {/* Invoice table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Invoice-wise Breakdown</p>
          <p className="text-xs text-gray-400 mt-0.5">For CA / GSTR-1 reference</p>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-12 px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase">
          <span className="col-span-4">Invoice</span>
          <span className="col-span-3 text-right">Taxable</span>
          <span className="col-span-2 text-right">CGST</span>
          <span className="col-span-3 text-right">SGST</span>
        </div>

        {shown.map(inv => (
          <div key={inv.number}
            className="grid grid-cols-12 px-3 py-2.5 border-b border-gray-50 last:border-0 items-center"
          >
            <div className="col-span-4 min-w-0">
              <p className="text-[11px] font-mono text-gray-700 truncate">{inv.number}</p>
              <p className="text-[10px] text-gray-400">{formatDate(inv.date)}</p>
            </div>
            <span className="col-span-3 text-right text-xs font-mono text-gray-700">
              {formatCurrency(inv.taxableForGST)}
            </span>
            <span className="col-span-2 text-right text-xs font-mono text-gray-600">
              {formatCurrency(inv.cgst)}
            </span>
            <span className="col-span-3 text-right text-xs font-mono text-gray-600">
              {formatCurrency(inv.sgst)}
            </span>
          </div>
        ))}

        {/* Totals */}
        <div className="grid grid-cols-12 px-3 py-3 bg-brand-50 border-t border-brand-100 items-center">
          <span className="col-span-4 text-xs font-bold text-brand-700">TOTAL</span>
          <span className="col-span-3 text-right text-xs font-bold font-mono text-brand-700">
            {formatCurrency(data.totalTaxable)}
          </span>
          <span className="col-span-2 text-right text-xs font-bold font-mono text-brand-700">
            {formatCurrency(data.totalCGST)}
          </span>
          <span className="col-span-3 text-right text-xs font-bold font-mono text-brand-700">
            {formatCurrency(data.totalSGST)}
          </span>
        </div>

        {/* Load more */}
        {show < data.invoices.length && (
          <div className="px-4 py-3 text-center border-t border-gray-50">
            <button
              onClick={() => setShow(s => s + PAGE)}
              className="text-sm text-brand-600 font-medium"
            >
              Load more ({data.invoices.length - show} remaining)
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 rounded-2xl px-4 py-3">
        <p className="text-xs text-amber-700">
          ⚠️ This report is for reference only. Verify all figures with your CA before filing GSTR-1 / GSTR-3B.
        </p>
      </div>

      {/* Export */}
      <div className="flex gap-3 pb-2">
        <button
          onClick={() => exportGSTPdf(data, rangeLabel)}
          className="flex-1 h-11 bg-gray-900 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-gray-800"
        >
          🖥️ Export for CA
        </button>
        <button
          onClick={() => shareWhatsApp(gstWhatsApp(data, rangeLabel))}
          className="flex-1 h-11 bg-green-500 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-green-600"
        >
          💬 WhatsApp
        </button>
      </div>
    </div>
  );
}
