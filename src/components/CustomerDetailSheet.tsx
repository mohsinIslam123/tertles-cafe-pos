import { useState, useEffect } from 'react';
import { db, type Customer, type Invoice } from '../db';
import { formatCurrency, formatDate, formatRelativeDate } from '../utils/format';
import BillDetailSheet from './BillDetailSheet';

interface CustomerDetailSheetProps {
  customer: Customer | null;
  onClose: () => void;
}

const PAGE_SIZE = 20;

const modeLabel: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };
const modeColor: Record<string, string> = {
  cash: 'bg-green-50 text-green-700',
  upi:  'bg-blue-50 text-blue-700',
  card: 'bg-purple-50 text-purple-700',
};

export default function CustomerDetailSheet({ customer, onClose }: CustomerDetailSheetProps) {
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const open = !!customer;

  useEffect(() => {
    if (!open || !customer?.id) { setInvoices([]); return; }
    setLoading(true);
    setPage(1);

    db.invoices
      .where('customer_id').equals(customer.id)
      .reverse()
      .sortBy('created_at')
      .then(all => {
        setHasMore(all.length > PAGE_SIZE);
        setInvoices(all.slice(0, PAGE_SIZE));
      })
      .finally(() => setLoading(false));
  }, [open, customer?.id]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const loadMore = async () => {
    if (!customer?.id) return;
    const nextPage = page + 1;
    const all = await db.invoices
      .where('customer_id').equals(customer.id)
      .reverse()
      .sortBy('created_at');
    setInvoices(all.slice(0, nextPage * PAGE_SIZE));
    setHasMore(all.length > nextPage * PAGE_SIZE);
    setPage(nextPage);
  };

  if (!open || !customer) return null;

  const savedInvoices    = invoices.filter(i => i.status === 'saved');
  const totalBills       = savedInvoices.length;

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex-none px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{customer.name}</h2>
                <p className="text-sm text-gray-500 font-mono">{customer.phone}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-lg"
              >×</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-brand-50 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-brand-700">
                  {formatCurrency(customer.total_spent)}
                </p>
                <p className="text-[10px] text-brand-500 font-medium">Total Spent</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-gray-800">{totalBills}</p>
                <p className="text-[10px] text-gray-500 font-medium">Bills</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                <p className="text-sm font-bold text-gray-800">
                  {customer.last_visit ? formatRelativeDate(new Date(customer.last_visit)) : '—'}
                </p>
                <p className="text-[10px] text-gray-500 font-medium">Last Visit</p>
              </div>
            </div>
          </div>

          {/* Bill list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-10 text-sm text-gray-300">Loading…</div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <span className="text-3xl">🧾</span>
                <p className="text-sm text-gray-400">No bills found for this customer.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invoices.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id!)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-gray-50"
                  >
                    {/* Left: date + invoice */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-gray-500">{inv.invoice_number}</p>
                        {inv.status === 'cancelled' && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-full">
                            VOID
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(new Date(inv.created_at))}</p>
                    </div>

                    {/* Mode chip */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${modeColor[inv.payment_mode]}`}>
                      {modeLabel[inv.payment_mode]}
                    </span>

                    {/* Amount */}
                    <p className={`text-sm font-bold font-mono ${inv.status === 'cancelled' ? 'text-gray-300 line-through' : 'text-gray-900'}`}>
                      {formatCurrency(inv.total)}
                    </p>
                  </button>
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="px-5 py-4 text-center">
                    <button
                      onClick={loadMore}
                      className="text-sm text-brand-600 font-medium"
                    >
                      Load more →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bill detail overlay */}
      <BillDetailSheet
        invoiceId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
