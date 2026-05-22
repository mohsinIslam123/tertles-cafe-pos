import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type Invoice, getSetting } from '../db';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { CONFIG } from '../config';
import {
  formatCurrencyRounded,
  formatDateTime,
  formatRelativeDate,
  todayStart,
  todayEnd,
  weekStart,
} from '../utils/format';

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = false,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col gap-1 p-4 rounded-2xl text-left
        transition-all duration-150 active:scale-[0.97]
        ${accent
          ? 'bg-brand-600 text-white shadow-md'
          : 'bg-white text-gray-900 shadow-sm border border-gray-100'
        }
      `}
    >
      <span className={`text-xs font-medium ${accent ? 'text-brand-100' : 'text-gray-400'}`}>
        {label}
      </span>
      <span className={`text-2xl font-bold tracking-tight ${accent ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </span>
      {sub && (
        <span className={`text-xs ${accent ? 'text-brand-200' : 'text-gray-400'}`}>
          {sub}
        </span>
      )}
    </button>
  );
}

// ── Recent transaction row ────────────────────────────────────────────────────

function TransactionRow({ invoice }: { invoice: Invoice }) {
  const isCancelled = invoice.status === 'cancelled';

  const modeLabel: Record<Invoice['payment_mode'], string> = {
    cash: 'Cash',
    upi:  'UPI',
    card: 'Card',
  };

  return (
    <div className={`flex items-center justify-between py-3.5 border-b border-gray-50 last:border-0 ${isCancelled ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500 shrink-0">
            {invoice.invoice_number}
          </span>
          {isCancelled && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-semibold rounded-full">
              VOID
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 truncate">
          {formatDateTime(invoice.created_at)} · {modeLabel[invoice.payment_mode]}
        </span>
      </div>
      <span className={`font-semibold text-sm ml-3 shrink-0 ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {formatCurrencyRounded(invoice.total)}
      </span>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface DashboardData {
  todaySales: number;
  todayBills: number;
  pendingDrafts: number;
  weekSales: number;
  recentInvoices: Invoice[];
}

async function loadDashboardData(): Promise<DashboardData> {
  const todayS = todayStart();
  const todayE = todayEnd();
  const weekS  = weekStart();

  // Today's saved invoices (not cancelled)
  const todayInvoices = await db.invoices
    .where('created_at')
    .between(todayS, todayE, true, true)
    .filter(inv => inv.status === 'saved')
    .toArray();

  // Week invoices (saved)
  const weekInvoices = await db.invoices
    .where('created_at')
    .between(weekS, todayE, true, true)
    .filter(inv => inv.status === 'saved')
    .toArray();

  // Recent 10 (all statuses, for visibility)
  const recentInvoices = await db.invoices
    .orderBy('created_at')
    .reverse()
    .limit(10)
    .toArray();

  // Pending drafts: check if 'cart_draft' setting has lines
  const draft = await getSetting<{ lines: unknown[] }>('cart_draft');
  const pendingDrafts = (draft && draft.lines.length > 0) ? 1 : 0;

  return {
    todaySales:     todayInvoices.reduce((sum, inv) => sum + inv.total, 0),
    todayBills:     todayInvoices.length,
    pendingDrafts,
    weekSales:      weekInvoices.reduce((sum, inv) => sum + inv.total, 0),
    recentInvoices,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isOnline, lastSyncAt } = useAppStore();
  const { logout } = useAuthStore();

  const [data, setData] = useState<DashboardData>({
    todaySales:     0,
    todayBills:     0,
    pendingDrafts:  0,
    weekSales:      0,
    recentInvoices: [],
  });
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  useEffect(() => {
    loadDashboardData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{CONFIG.SHOP_NAME}</h1>
            <p className="text-brand-200 text-sm mt-0.5">{dateLabel}</p>
          </div>
          {/* Online indicator + logout */}
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}
              />
              <span className="text-xs text-brand-200">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs text-brand-300 px-2 py-1 rounded-lg border border-brand-500 active:bg-brand-700 transition-colors"
            >
              Lock
            </button>
          </div>
        </div>

        {/* Last sync */}
        <p className="text-[11px] text-brand-300 mt-2">
          {lastSyncAt
            ? `Synced ${formatRelativeDate(lastSyncAt)}`
            : 'Never synced'}
        </p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="px-4 -mt-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Today's Sale"
            value={loading ? '—' : formatCurrencyRounded(data.todaySales)}
            sub={loading ? '' : `${data.todayBills} bill${data.todayBills !== 1 ? 's' : ''}`}
            accent
          />
          <StatCard
            label="Today's Bills"
            value={loading ? '—' : String(data.todayBills)}
            sub="saved invoices"
          />
          <StatCard
            label="Pending Drafts"
            value={loading ? '—' : String(data.pendingDrafts)}
            sub={data.pendingDrafts > 0 ? 'Tap to resume' : 'All clear'}
            onClick={data.pendingDrafts > 0 ? () => navigate('/bill') : undefined}
          />
          <StatCard
            label="This Week"
            value={loading ? '—' : formatCurrencyRounded(data.weekSales)}
            sub="Mon – today"
          />
        </div>
      </div>

      {/* ── Recent transactions ──────────────────────────────────────────────── */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Recent Transactions</h2>
          <button
            onClick={() => navigate('/more/bill-search')}
            className="text-xs text-brand-600 font-medium"
          >
            View all
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 divide-y divide-gray-50">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-300">Loading…</div>
          ) : data.recentInvoices.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <span className="text-3xl">🧾</span>
              <p className="text-sm text-gray-400 text-center">
                No bills yet today.
                <br />Tap <strong className="text-brand-600">+ New Bill</strong> to get started.
              </p>
            </div>
          ) : (
            data.recentInvoices.map(inv => (
              <TransactionRow key={inv.id} invoice={inv} />
            ))
          )}
        </div>
      </div>

      {/* ── Sticky New Bill CTA ──────────────────────────────────────────────── */}
      <div className="fixed bottom-16 left-0 right-0 px-4 z-30 pointer-events-none">
        <button
          onClick={() => navigate('/bill')}
          className="
            w-full h-14 bg-brand-600 text-white rounded-2xl
            text-base font-semibold shadow-xl
            flex items-center justify-center gap-2
            transition-all duration-100 active:scale-[0.98] active:bg-brand-700
            pointer-events-auto
          "
        >
          <span className="text-xl leading-none">+</span>
          New Bill
        </button>
      </div>
    </div>
  );
}
