import { useState, useEffect } from 'react';
import { db } from '../db';
import { formatCurrency } from '../utils/format';
import { exportItemsPdf, itemsWhatsApp, shareWhatsApp, type ItemExportData, type ItemRow } from '../utils/reportExport';

interface ItemsTabProps { start: Date; end: Date; rangeLabel: string; }

export default function ItemsTab({ start, end, rangeLabel }: ItemsTabProps) {
  const [data, setData]     = useState<ItemExportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    async function load() {
      const invoices = await db.invoices
        .where('created_at').between(start, end, true, true)
        .filter(i => i.status === 'saved')
        .toArray();

      const invoiceIds = invoices.map(i => i.id!);

      const lineItems = invoiceIds.length > 0
        ? await db.invoice_items.where('invoice_id').anyOf(invoiceIds).toArray()
        : [];

      // Aggregate by item
      const aggMap = new Map<number, { name: string; code: string; qty: number; revenue: number }>();
      const soldIds = new Set<number>();

      lineItems.forEach(li => {
        soldIds.add(li.item_id);
        const ex = aggMap.get(li.item_id) ?? { name: li.item_name_snapshot, code: '', qty: 0, revenue: 0 };
        aggMap.set(li.item_id, {
          name:    li.item_name_snapshot,
          code:    ex.code,
          qty:     ex.qty + li.qty,
          revenue: ex.revenue + li.line_total,
        });
      });

      // Attach codes from items table
      const allItems = await db.items.toArray();
      allItems.forEach(item => {
        if (aggMap.has(item.id!)) {
          aggMap.get(item.id!)!.code = item.code;
        }
      });

      const agg: ItemRow[] = [...aggMap.values()];
      const topByRevenue = [...agg].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      const topByQty     = [...agg].sort((a, b) => b.qty - a.qty).slice(0, 10);
      const deadStock    = allItems
        .filter(item => !soldIds.has(item.id!))
        .map(item => ({ name: item.name, code: item.code }));

      setData({ topByRevenue, topByQty, deadStock });
    }

    load().finally(() => setLoading(false));
  }, [start, end]);

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (!data || (data.topByRevenue.length === 0 && data.topByQty.length === 0)) {
    return (
      <div className="flex flex-col items-center py-16 gap-2">
        <span className="text-4xl">🍽️</span>
        <p className="text-sm text-gray-500 text-center">No item sales in this period.</p>
      </div>
    );
  }

  const maxRevenue = data.topByRevenue[0]?.revenue ?? 1;
  const maxQty     = data.topByQty[0]?.qty ?? 1;

  return (
    <div className="space-y-4">
      {/* Top by revenue */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top by Revenue</p>
        </div>
        {data.topByRevenue.map((item, i) => (
          <div key={i} className="px-4 py-3 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-400 font-mono w-5 text-center flex-none">
                  {i + 1}
                </span>
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              </div>
              <div className="text-right flex-none ml-3">
                <p className="text-sm font-bold text-gray-900">{formatCurrency(item.revenue)}</p>
                <p className="text-xs text-gray-400">{item.qty} sold</p>
              </div>
            </div>
            <div className="ml-7 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full"
                style={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Top by quantity */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top by Quantity</p>
        </div>
        {data.topByQty.map((item, i) => (
          <div key={i} className="px-4 py-3 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-400 font-mono w-5 text-center flex-none">{i + 1}</span>
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              </div>
              <div className="text-right flex-none ml-3">
                <p className="text-sm font-bold text-gray-900">{item.qty} sold</p>
                <p className="text-xs text-gray-400">{formatCurrency(item.revenue)}</p>
              </div>
            </div>
            <div className="ml-7 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(item.qty / maxQty) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Dead stock */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dead Stock</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            data.deadStock.length > 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
          }`}>
            {data.deadStock.length} item{data.deadStock.length !== 1 ? 's' : ''}
          </span>
        </div>
        {data.deadStock.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">All items sold in this period 🎉</p>
        ) : (
          data.deadStock.slice(0, 10).map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
              <p className="text-sm text-gray-700">{item.name}</p>
              <p className="text-xs font-mono text-gray-400">{item.code}</p>
            </div>
          ))
        )}
        {data.deadStock.length > 10 && (
          <p className="text-xs text-gray-400 text-center py-2">+{data.deadStock.length - 10} more (see PDF export)</p>
        )}
      </div>

      {/* Export */}
      <div className="flex gap-3 pb-2">
        <button
          onClick={() => exportItemsPdf(data, rangeLabel)}
          className="flex-1 h-11 bg-gray-900 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-gray-800"
        >
          🖥️ Export PDF
        </button>
        <button
          onClick={() => shareWhatsApp(itemsWhatsApp(data, rangeLabel))}
          className="flex-1 h-11 bg-green-500 text-white rounded-2xl text-sm font-semibold
                     flex items-center justify-center gap-2 active:bg-green-600"
        >
          💬 WhatsApp
        </button>
      </div>
    </div>
  );
}
