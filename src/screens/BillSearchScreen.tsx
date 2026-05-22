import { useState, useEffect, useCallback } from 'react';
import { db, type Invoice, type Customer } from '../db';
import { formatCurrency, formatDateTime, todayStart, todayEnd, weekStart } from '../utils/format';
import BillDetailSheet from '../components/BillDetailSheet';

// ── Date preset helpers ───────────────────────────────────────────────────────

function yesterday(): { start: Date; end: Date } {
  const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

function monthStart(): Date {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all';
type PayFilter  = 'all' | 'cash' | 'upi' | 'card';
type StatusFilter = 'all' | 'saved' | 'cancelled';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'This Week',
  month: 'This Month', all: 'All Time',
};

const PAGE_SIZE = 25;

// ── Invoice row ───────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  customerName,
  onClick,
}: {
  invoice: Invoice;
  customerName: string | null;
  onClick: () => void;
}) {
  const isCancelled = invoice.status === 'cancelled';
  const modeChip: Record<string, string> = {
    cash: 'bg-green-50 text-green-700',
    upi:  'bg-blue-50 text-blue-700',
    card: 'bg-purple-50 text-purple-700',
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50
                 border-b border-gray-50 last:border-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-mono text-gray-600">{invoice.invoice_number}</p>
          {isCancelled && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-full">
              VOID
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDateTime(invoice.created_at)}
          {customerName && <span className="ml-2 text-gray-500">· {customerName}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-none">
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${modeChip[invoice.payment_mode]}`}>
          {invoice.payment_mode.toUpperCase()}
        </span>
        <p className={`text-sm font-bold font-mono ${isCancelled ? 'text-gray-300 line-through' : 'text-gray-900'}`}>
          {formatCurrency(invoice.total)}
        </p>
      </div>
    </button>
  );
}

// ── BillSearchScreen ──────────────────────────────────────────────────────────

export default function BillSearchScreen() {
  const [query, setQuery]         = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [payFilter, setPayFilter]   = useState<PayFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [results, setResults]     = useState<Invoice[]>([]);
  const [customerMap, setCustomerMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading]     = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount]     = useState(0);
  const [selectedId, setSelectedId]     = useState<number | null>(null);

  // ── Date range from preset ─────────────────────────────────────────────────

  const getDateRange = (): { start: Date; end: Date } | null => {
    switch (datePreset) {
      case 'today':     return { start: todayStart(), end: todayEnd() };
      case 'yesterday': return yesterday();
      case 'week':      return { start: weekStart(), end: todayEnd() };
      case 'month':     return { start: monthStart(), end: todayEnd() };
      case 'all':       return null;
    }
  };

  // ── Search ─────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    setLoading(true);
    setDisplayCount(PAGE_SIZE);

    try {
      const range = getDateRange();
      let invoices: Invoice[];

      if (range) {
        invoices = await db.invoices
          .where('created_at')
          .between(range.start, range.end, true, true)
          .reverse()
          .sortBy('created_at');
      } else {
        invoices = await db.invoices.orderBy('created_at').reverse().toArray();
      }

      // Payment mode filter
      if (payFilter !== 'all') {
        invoices = invoices.filter(i => i.payment_mode === payFilter);
      }

      // Status filter
      if (statusFilter !== 'all') {
        invoices = invoices.filter(i => i.status === statusFilter);
      }

      // Text query
      const q = query.trim().toLowerCase();
      if (q) {
        // Match invoice number directly
        const byNumber = invoices.filter(i => i.invoice_number.toLowerCase().includes(q));

        // Match by customer
        const customers = await db.customers
          .filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
          .toArray();
        const custIds = new Set(customers.map(c => c.id!));
        const byCust  = invoices.filter(i => i.customer_id && custIds.has(i.customer_id));

        // Merge dedupe preserving order
        const seen = new Set<number>();
        const merged: Invoice[] = [];
        for (const inv of [...byNumber, ...byCust]) {
          if (!seen.has(inv.id!)) { seen.add(inv.id!); merged.push(inv); }
        }
        invoices = merged;
      }

      // Build customer name map for display
      const custIds = new Set(invoices.filter(i => i.customer_id).map(i => i.customer_id!));
      const custList: Customer[] = custIds.size > 0
        ? await db.customers.where('id').anyOf([...custIds]).toArray()
        : [];
      const newMap = new Map<number, string>();
      custList.forEach(c => newMap.set(c.id!, c.name));

      setTotalCount(invoices.length);
      setResults(invoices);
      setCustomerMap(newMap);
    } finally {
      setLoading(false);
    }
  }, [query, datePreset, payFilter, statusFilter]);

  // Run search on every filter change (debounced for text)
  useEffect(() => {
    const timer = setTimeout(runSearch, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [runSearch]);

  // Refresh after bill detail close (cancel may have changed status)
  const handleDetailClose = () => {
    setSelectedId(null);
    runSearch();
  };

  const displayed = results.slice(0, displayCount);
  const hasMore   = displayCount < results.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold">Bill Search</h1>
        <p className="text-brand-200 text-xs mt-0.5">
          {loading ? 'Searching…' : `${totalCount} result${totalCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Invoice #, customer name, or phone…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-9 bg-gray-50 border border-gray-200 rounded-2xl text-sm
                       outline-none focus:border-brand-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
            >×</button>
          )}
        </div>
      </div>

      {/* Filters sticky bar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10 px-4 pt-2 pb-3 space-y-2">
        {/* Date presets */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map(p => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                ${datePreset === p
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Payment + status chips */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {(['all', 'cash', 'upi', 'card'] as PayFilter[]).map(m => (
            <button
              key={m}
              onClick={() => setPayFilter(m)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                ${payFilter === m
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
            >
              {m === 'all' ? 'All Modes' : m.toUpperCase()}
            </button>
          ))}
          <div className="w-px bg-gray-200 mx-1" />
          {(['all', 'saved', 'cancelled'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                ${statusFilter === s
                  ? s === 'cancelled' ? 'bg-red-500 text-white' : 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
            >
              {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="px-4 pt-3">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-300">Searching…</div>

        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl">🧾</span>
            <p className="text-sm text-gray-500 text-center">
              No bills found for this filter.
              <br />Try a different date range or clear the search.
            </p>
          </div>

        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              {displayed.map(inv => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  customerName={inv.customer_id ? customerMap.get(inv.customer_id) ?? null : null}
                  onClick={() => setSelectedId(inv.id!)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="text-center py-5">
                <button
                  onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                  className="text-sm text-brand-600 font-medium"
                >
                  Load more ({results.length - displayCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bill detail */}
      <BillDetailSheet
        invoiceId={selectedId}
        onClose={handleDetailClose}
      />
    </div>
  );
}
