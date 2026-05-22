import { useState, useEffect } from 'react';
import { db } from '../db';
import { formatCurrency, formatDate } from '../utils/format';
import { shareWhatsApp } from '../utils/reportExport';
import { CONFIG } from '../config';

interface CustomersTabProps { start: Date; end: Date; rangeLabel: string; }

interface SpenderRow { name: string; phone: string; spent: number; bills: number; lastVisit: Date | null; }
interface CustomerData {
  newCount: number;
  repeatCount: number;
  walkInCount: number;
  topSpenders: SpenderRow[];
}

export default function CustomersTab({ start, end, rangeLabel }: CustomersTabProps) {
  const [data, setData]     = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    async function load() {
      const periodInvoices = await db.invoices
        .where('created_at').between(start, end, true, true)
        .filter(i => i.status === 'saved')
        .toArray();

      // Walk-in (no customer attached)
      const walkInCount = periodInvoices.filter(i => !i.customer_id).length;

      // Unique customer IDs in period
      const custIdsInPeriod = new Set(
        periodInvoices.filter(i => i.customer_id).map(i => i.customer_id!)
      );

      let newCount = 0, repeatCount = 0;
      const spenderMap = new Map<number, SpenderRow>();

      for (const custId of custIdsInPeriod) {
        const customer = await db.customers.get(custId);
        if (!customer) continue;

        // Their invoices BEFORE the period
        const priorInvoices = await db.invoices
          .where('customer_id').equals(custId)
          .filter(i => new Date(i.created_at) < start && i.status === 'saved')
          .count();

        if (priorInvoices === 0) newCount++;
        else repeatCount++;

        // Spend in this period
        const periodSpend = periodInvoices
          .filter(i => i.customer_id === custId)
          .reduce((s, i) => s + i.total, 0);
        const periodBills = periodInvoices.filter(i => i.customer_id === custId).length;

        spenderMap.set(custId, {
          name:      customer.name,
          phone:     customer.phone,
          spent:     periodSpend,
          bills:     periodBills,
          lastVisit: customer.last_visit,
        });
      }

      const topSpenders = [...spenderMap.values()]
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 10);

      setData({ newCount, repeatCount, walkInCount, topSpenders });
    }
    load().finally(() => setLoading(false));
  }, [start, end]);

  const waText = data ? `*${CONFIG.SHOP_NAME} — Customer Report*
📅 ${rangeLabel}

👤 New Customers: ${data.newCount}
🔄 Repeat Customers: ${data.repeatCount}
🚶 Walk-ins: ${data.walkInCount}

🏆 Top Spender: ${data.topSpenders[0]?.name ?? '—'} (${formatCurrency(data.topSpenders[0]?.spent ?? 0)})` : '';

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (!data || (data.newCount + data.repeatCount + data.walkInCount === 0)) {
    return (
      <div className="flex flex-col items-center py-16 gap-2">
        <span className="text-4xl">👥</span>
        <p className="text-sm text-gray-500 text-center">No customer data in this period.</p>
      </div>
    );
  }

  const total = data.newCount + data.repeatCount;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'New',     value: String(data.newCount),    color: 'bg-green-50 text-green-700' },
          { label: 'Repeat',  value: String(data.repeatCount), color: 'bg-blue-50 text-blue-700'  },
          { label: 'Walk-ins',value: String(data.walkInCount), color: 'bg-gray-50 text-gray-600'  },
        ].map(c => (
          <div key={c.label} className={`${c.color} rounded-2xl p-3.5 text-center`}>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs font-medium mt-0.5 opacity-75">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Retention bar */}
      {total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Retention</p>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-green-400 rounded-l-full"
              style={{ width: `${(data.newCount / total) * 100}%` }}
            />
            <div
              className="h-full bg-blue-400"
              style={{ width: `${(data.repeatCount / total) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-green-600 font-medium">
              New {Math.round((data.newCount / total) * 100)}%
            </span>
            <span className="text-xs text-blue-600 font-medium">
              Repeat {Math.round((data.repeatCount / total) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Top spenders */}
      {data.topSpenders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top Spenders (this period)</p>
          </div>
          {data.topSpenders.map((s, i) => (
            <div key={s.phone} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <span className="text-sm font-bold text-gray-300 w-5 text-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-400">
                  {s.bills} bill{s.bills !== 1 ? 's' : ''} ·
                  {s.lastVisit ? ` last ${formatDate(new Date(s.lastVisit))}` : ''}
                </p>
              </div>
              <p className="text-sm font-bold text-brand-700 font-mono">{formatCurrency(s.spent)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Export */}
      <button
        onClick={() => shareWhatsApp(waText)}
        className="w-full h-11 bg-green-500 text-white rounded-2xl text-sm font-semibold
                   flex items-center justify-center gap-2 active:bg-green-600"
      >
        💬 Share on WhatsApp
      </button>
    </div>
  );
}
