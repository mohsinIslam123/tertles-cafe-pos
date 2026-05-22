import { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { formatCurrency, formatDate, toISODateString } from '../utils/format';
import {
  exportSalesPdf, salesWhatsApp, shareWhatsApp,
  type SalesExportData, type SalesDailyRow,
} from '../utils/reportExport';

// ── Inline SVG line chart ─────────────────────────────────────────────────────

function LineChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return null;

  const W = 320, H = 100, PAD_L = 10, PAD_R = 10, PAD_T = 10, PAD_B = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const max    = Math.max(...data.map(d => d.value), 1);
  const n      = data.length;

  const pts = data.map((d, i) => {
    const x = PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const y = PAD_T + chartH - (d.value / max) * chartH;
    return { x, y, label: d.label, value: d.value };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');

  // Show every Nth label to avoid overlap
  const labelEvery = Math.ceil(n / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map(t => {
        const y = PAD_T + chartH - t * chartH;
        return (
          <line key={t} x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
            stroke="#f3f4f6" strokeWidth="1" />
        );
      })}

      {/* Area fill */}
      <polygon
        points={`${pts[0].x},${PAD_T + chartH} ${polyline} ${pts[pts.length - 1].x},${PAD_T + chartH}`}
        fill="#1a4731" fillOpacity="0.08"
      />

      {/* Line */}
      {n > 1 && (
        <polyline points={polyline} fill="none" stroke="#1a4731" strokeWidth="2" strokeLinejoin="round" />
      )}

      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={n === 1 ? 4 : 3} fill="#1a4731" />
      ))}

      {/* X labels */}
      {pts.map((p, i) => (
        i % labelEvery === 0 ? (
          <text key={i} x={p.x} y={H - 4} fontSize="7" fill="#9ca3af"
            textAnchor="middle">{p.label}</text>
        ) : null
      ))}
    </svg>
  );
}

// ── SalesTab ──────────────────────────────────────────────────────────────────

interface SalesTabProps {
  start: Date;
  end: Date;
  rangeLabel: string;
}

export default function SalesTab({ start, end, rangeLabel }: SalesTabProps) {
  const [daily, setDaily]   = useState<SalesDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cash, setCash]     = useState(0);
  const [upi, setUpi]       = useState(0);
  const [card, setCard]     = useState(0);

  useEffect(() => {
    setLoading(true);
    db.invoices
      .where('created_at').between(start, end, true, true)
      .filter(i => i.status === 'saved')
      .toArray()
      .then(invoices => {
        // Group by date
        const map = new Map<string, { date: Date; bills: number; sales: number }>();
        let c = 0, u = 0, k = 0;

        invoices.forEach(inv => {
          const ds = toISODateString(new Date(inv.created_at));
          const ex = map.get(ds) ?? { date: new Date(inv.created_at), bills: 0, sales: 0 };
          map.set(ds, { date: ex.date, bills: ex.bills + 1, sales: ex.sales + inv.total });
          if (inv.payment_mode === 'cash') c += inv.total;
          else if (inv.payment_mode === 'upi') u += inv.total;
          else k += inv.total;
        });

        const sorted = [...map.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v);

        setDaily(sorted);
        setCash(c); setUpi(u); setCard(k);
      })
      .finally(() => setLoading(false));
  }, [start, end]);

  const totalSales = useMemo(() => daily.reduce((s, d) => s + d.sales, 0), [daily]);
  const billCount  = useMemo(() => daily.reduce((s, d) => s + d.bills, 0), [daily]);
  const avgBill    = billCount > 0 ? totalSales / billCount : 0;

  const chartData = daily.map(d => ({
    label: formatDate(d.date).slice(0, 5), // dd/mm
    value: d.sales,
  }));

  const exportData: SalesExportData = {
    totalSales, billCount, avgBill, cashSales: cash, upiSales: upi, cardSales: card, daily,
  };

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (billCount === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-2">
        <span className="text-4xl">📊</span>
        <p className="text-sm text-gray-500 text-center">No bills in this period.<br />Try a different date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Sales', value: formatCurrency(totalSales), accent: true },
          { label: 'Bills', value: String(billCount) },
          { label: 'Avg Bill', value: formatCurrency(avgBill) },
          { label: 'Highest', value: formatCurrency(Math.max(...daily.map(d => d.sales))) },
        ].map(c => (
          <div key={c.label}
            className={`p-4 rounded-2xl ${c.accent ? 'bg-brand-600 text-white' : 'bg-white border border-gray-100'}`}
          >
            <p className={`text-xs font-medium ${c.accent ? 'text-brand-200' : 'text-gray-400'}`}>{c.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${c.accent ? 'text-white' : 'text-gray-900'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Payment split */}
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Payment Split</p>
        {[
          { label: 'Cash', amount: cash, color: 'bg-green-500' },
          { label: 'UPI',  amount: upi,  color: 'bg-blue-500' },
          { label: 'Card', amount: card, color: 'bg-purple-500' },
        ].filter(p => p.amount > 0).map(p => (
          <div key={p.label} className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-700">{p.label}</span>
              <span className="font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${p.color} rounded-full`}
                style={{ width: `${totalSales > 0 ? (p.amount / totalSales) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Line chart */}
      {daily.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-4 pt-3 pb-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Daily Sales</p>
          <LineChart data={chartData} />
        </div>
      )}

      {/* Daily table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Day-wise Breakdown</p>
        </div>
        <div className="divide-y divide-gray-50">
          {daily.map((d, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{formatDate(d.date)}</p>
                <p className="text-xs text-gray-400">{d.bills} bill{d.bills !== 1 ? 's' : ''}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900 font-mono">{formatCurrency(d.sales)}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-brand-50 border-t border-brand-100">
          <p className="text-sm font-bold text-brand-700">Total</p>
          <p className="text-sm font-bold text-brand-700 font-mono">{formatCurrency(totalSales)}</p>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex gap-3 pb-2">
        <button
          onClick={() => exportSalesPdf(exportData, rangeLabel)}
          className="flex-1 h-11 bg-gray-900 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-gray-800"
        >
          🖥️ Export PDF
        </button>
        <button
          onClick={() => shareWhatsApp(salesWhatsApp(exportData, rangeLabel))}
          className="flex-1 h-11 bg-green-500 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-green-600"
        >
          💬 WhatsApp
        </button>
      </div>
    </div>
  );
}
