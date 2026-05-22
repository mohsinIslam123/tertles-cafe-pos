import { useState, useEffect } from 'react';
import { db, type DayClose } from '../db';
import { formatCurrency, formatDate } from '../utils/format';

interface DayCloseTabProps { start: Date; end: Date; rangeLabel: string; }

export default function DayCloseTab({ start, end }: DayCloseTabProps) {
  const [closes, setCloses]   = useState<DayClose[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Filter by date string range (day_closes.date is "YYYY-MM-DD")
    const startStr = start.toISOString().slice(0, 10);
    const endStr   = end.toISOString().slice(0, 10);
    db.day_closes
      .where('date').between(startStr, endStr, true, true)
      .reverse()
      .sortBy('date')
      .then(setCloses)
      .finally(() => setLoading(false));
  }, [start, end]);

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (closes.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3">
        <span className="text-4xl">📅</span>
        <p className="text-base font-semibold text-gray-700">No day closes yet</p>
        <p className="text-sm text-gray-400 text-center px-4">
          Run a day close from More → Day Close to see history here.
        </p>
      </div>
    );
  }

  const totalSales    = closes.reduce((s, c) => s + c.total_sales, 0);
  const totalVariance = closes.reduce((s, c) => s + c.variance, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand-600 text-white rounded-2xl p-4">
          <p className="text-brand-200 text-xs">Total Sales</p>
          <p className="text-2xl font-bold mt-0.5">{formatCurrency(totalSales)}</p>
        </div>
        <div className={`rounded-2xl p-4 ${totalVariance === 0 ? 'bg-green-50' : totalVariance > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
          <p className="text-xs text-gray-500">Total Variance</p>
          <p className={`text-2xl font-bold mt-0.5 ${totalVariance === 0 ? 'text-green-700' : totalVariance > 0 ? 'text-blue-700' : 'text-red-600'}`}>
            {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
          </p>
        </div>
      </div>

      {/* Day-wise list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Day-wise Closes</p>
        </div>
        {closes.map(dc => (
          <div key={dc.id} className="px-4 py-3.5 border-b border-gray-50 last:border-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {formatDate(new Date(dc.date + 'T00:00:00'))}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {dc.bills_count} bills · Opening ₹{dc.opening_cash} · Closing ₹{dc.closing_cash}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">{formatCurrency(dc.total_sales)}</p>
                {dc.variance !== 0 && (
                  <p className={`text-xs font-medium mt-0.5 ${dc.variance > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                    {dc.variance > 0 ? '+' : ''}{formatCurrency(dc.variance)} variance
                  </p>
                )}
              </div>
            </div>
            {dc.notes && (
              <p className="text-xs text-gray-400 mt-1.5 italic">"{dc.notes}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
