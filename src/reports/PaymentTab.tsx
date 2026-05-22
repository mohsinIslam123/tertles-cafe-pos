import { useState, useEffect } from 'react';
import { db } from '../db';
import { formatCurrency } from '../utils/format';
import { shareWhatsApp } from '../utils/reportExport';
import { CONFIG } from '../config';

interface PaymentTabProps { start: Date; end: Date; rangeLabel: string; }

interface PayData { total: number; count: number; }

export default function PaymentTab({ start, end, rangeLabel }: PaymentTabProps) {
  const [cash, setCash]   = useState<PayData>({ total: 0, count: 0 });
  const [upi, setUpi]     = useState<PayData>({ total: 0, count: 0 });
  const [card, setCard]   = useState<PayData>({ total: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    db.invoices
      .where('created_at').between(start, end, true, true)
      .filter(i => i.status === 'saved')
      .toArray()
      .then(invoices => {
        const c: PayData = { total: 0, count: 0 };
        const u: PayData = { total: 0, count: 0 };
        const k: PayData = { total: 0, count: 0 };
        invoices.forEach(inv => {
          if      (inv.payment_mode === 'cash') { c.total += inv.total; c.count++; }
          else if (inv.payment_mode === 'upi')  { u.total += inv.total; u.count++; }
          else                                  { k.total += inv.total; k.count++; }
        });
        setCash(c); setUpi(u); setCard(k);
      })
      .finally(() => setLoading(false));
  }, [start, end]);

  const grandTotal = cash.total + upi.total + card.total;
  const grandCount = cash.count + upi.count + card.count;

  const modes = [
    { id: 'cash', label: 'Cash',  icon: '💵', data: cash,  color: 'bg-green-500',  light: 'bg-green-50',  text: 'text-green-700' },
    { id: 'upi',  label: 'UPI',   icon: '📱', data: upi,   color: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-700'  },
    { id: 'card', label: 'Card',  icon: '💳', data: card,  color: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-700'},
  ].filter(m => m.data.count > 0);

  const waText = `*${CONFIG.SHOP_NAME} — Payment Report*
📅 ${rangeLabel}

Total: ${formatCurrency(grandTotal)} (${grandCount} bills)
💵 Cash: ${formatCurrency(cash.total)} (${cash.count} bills)
📱 UPI: ${formatCurrency(upi.total)} (${upi.count} bills)
💳 Card: ${formatCurrency(card.total)} (${card.count} bills)`;

  if (loading) return <p className="text-center py-10 text-sm text-gray-300">Loading…</p>;

  if (grandCount === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-2">
        <span className="text-4xl">💰</span>
        <p className="text-sm text-gray-500 text-center">No payment data in this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="bg-brand-600 rounded-2xl p-4 text-white">
        <p className="text-brand-200 text-xs font-medium">Total Collections</p>
        <p className="text-3xl font-bold mt-1">{formatCurrency(grandTotal)}</p>
        <p className="text-brand-200 text-sm mt-0.5">{grandCount} bills</p>
      </div>

      {/* Mode cards */}
      {modes.map(m => {
        const pct = grandTotal > 0 ? (m.data.total / grandTotal) * 100 : 0;
        return (
          <div key={m.id} className={`${m.light} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{m.icon}</span>
                <span className={`text-sm font-bold ${m.text}`}>{m.label}</span>
              </div>
              <span className={`text-xs font-bold ${m.text} px-2 py-0.5 bg-white rounded-full`}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-2xl font-bold ${m.text}`}>{formatCurrency(m.data.total)}</p>
                <p className={`text-xs ${m.text} opacity-75`}>{m.data.count} bill{m.data.count !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {/* Mini bar */}
            <div className="h-1.5 bg-white/50 rounded-full mt-3 overflow-hidden">
              <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

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
