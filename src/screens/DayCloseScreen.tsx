import { useState, useEffect, useCallback } from 'react';
import { db, type DayClose, type Invoice } from '../db';
import { usePrinterStore } from '../stores/printerStore';
import { buildZReportBytes, printZReportHtml, type ZReportData } from '../utils/zReport';
import { printerService } from '../services/printer';
import {
  formatCurrency, formatDate, formatDateTime,
  todayStart, todayEnd, toISODateString,
} from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import PrintResultSheet from '../components/PrintResultSheet';

// ── Stat row ─────────────────────────────────────────────────────────────────

function StatRow({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-3 border-b border-gray-50 last:border-0
      ${accent ? 'bg-brand-50 -mx-4 px-4 rounded-xl' : ''}`}
    >
      <div>
        <p className={`text-sm font-medium ${accent ? 'text-brand-700' : 'text-gray-700'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm font-bold font-mono ${accent ? 'text-brand-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

// ── Cash input ────────────────────────────────────────────────────────────────

function CashInput({ label, value, onChange, hint, error }: {
  label: string; value: number | ''; onChange: (v: number) => void;
  hint?: string; error?: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400 mt-0.5 mb-1.5">{hint}</p>}
      <div className="relative mt-1.5">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₹</span>
        <input
          type="text"
          inputMode="numeric"
          value={value === '' ? '' : String(value)}
          onChange={e => {
            const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
            if (!isNaN(n)) onChange(n);
            else if (e.target.value === '') onChange(0);
          }}
          className={`w-full h-12 pl-8 pr-4 border rounded-2xl text-sm font-medium outline-none transition-colors
            ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-brand-500 bg-white'}`}
          placeholder="0"
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DayCloseScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function DayCloseScreen() {
  const today    = new Date();
  const todayStr = toISODateString(today);

  // ── State ──────────────────────────────────────────────────────────────────
  const [alreadyClosed, setAlreadyClosed] = useState<DayClose | null>(null);
  const [invoices, setInvoices]           = useState<Invoice[]>([]);
  const [openingCash, setOpeningCash]     = useState<number>(0);
  const [closingCash, setClosingCash]     = useState<number>(0);
  const [notes, setNotes]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [printOpen, setPrintOpen]         = useState(false);
  const [closingError, setClosingError]   = useState('');

  const { status, lastError } = usePrinterStore(s => ({
    status: s.status, lastError: s.lastError,
  }));

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check already closed
      const dc = await db.day_closes.where('date').equals(todayStr).first();
      setAlreadyClosed(dc ?? null);
      if (dc) return;

      // Load today's invoices
      const todayInvs = await db.invoices
        .where('created_at').between(todayStart(), todayEnd(), true, true)
        .toArray();
      setInvoices(todayInvs);

      // Auto-fill opening cash from yesterday's close
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const prevClose = await db.day_closes
        .where('date').equals(toISODateString(yesterday))
        .first();
      setOpeningCash(prevClose?.closing_cash ?? 0);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const saved     = invoices.filter(i => i.status === 'saved');
  const cancelled = invoices.filter(i => i.status === 'cancelled');

  const cashSales  = saved.filter(i => i.payment_mode === 'cash').reduce((s, i) => s + i.total, 0);
  const cashCount  = saved.filter(i => i.payment_mode === 'cash').length;
  const upiSales   = saved.filter(i => i.payment_mode === 'upi').reduce((s, i) => s + i.total, 0);
  const upiCount   = saved.filter(i => i.payment_mode === 'upi').length;
  const cardSales  = saved.filter(i => i.payment_mode === 'card').reduce((s, i) => s + i.total, 0);
  const cardCount  = saved.filter(i => i.payment_mode === 'card').length;
  const totalSales = cashSales + upiSales + cardSales;
  const billCount  = saved.length;

  const expectedCash = openingCash + cashSales;
  const variance     = expectedCash - closingCash;

  // ── Build Z report data ───────────────────────────────────────────────────

  const buildZData = (closedAt: Date): ZReportData => ({
    date: today, closedAt,
    openingCash, totalSales, billCount,
    cancelledCount: cancelled.length,
    cashSales, cashCount, upiSales, upiCount, cardSales, cardCount,
    expectedCash, closingCash, variance, notes,
  });

  // ── Save day close ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setShowConfirm(false);
    try {
      const closedAt = new Date();

      await db.day_closes.add({
        date:         todayStr,
        opening_cash: openingCash,
        total_sales:  totalSales,
        bills_count:  billCount,
        total_cash:   cashSales,
        total_upi:    upiSales,
        total_card:   cardSales,
        closing_cash: closingCash,
        variance,
        notes,
        closed_at:    closedAt,
      });

      // Auto-print Z report
      const zData = buildZData(closedAt);
      if (printerService.isPaired()) {
        setPrintOpen(true);
        const bytes = buildZReportBytes(zData);
        await printerService.print(bytes, 1);
      }

      await loadData(); // Reload to show "already closed" state
    } catch (e) {
      console.error('Day close failed:', e);
      setClosingError('Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Print Z report (from already-closed state) ────────────────────────────

  const handleReprintZ = async (dc: DayClose) => {
    const zData: ZReportData = {
      date:           new Date(dc.date + 'T00:00:00'),
      closedAt:       new Date(dc.closed_at),
      openingCash:    dc.opening_cash,
      totalSales:     dc.total_sales,
      billCount:      dc.bills_count,
      cancelledCount: 0,
      cashSales:      dc.total_cash,  cashCount: 0,
      upiSales:       dc.total_upi,   upiCount: 0,
      cardSales:      dc.total_card,  cardCount: 0,
      expectedCash:   dc.opening_cash + dc.total_cash,
      closingCash:    dc.closing_cash,
      variance:       dc.variance,
      notes:          dc.notes,
    };

    if (printerService.isPaired()) {
      setPrintOpen(true);
      const bytes = buildZReportBytes(zData);
      await printerService.print(bytes, 1);
    } else {
      printZReportHtml(zData);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-300">Loading…</p>
      </div>
    );
  }

  // ── Already closed ───────────────────────────────────────────────────────

  if (alreadyClosed) {
    const dc = alreadyClosed;
    const dcVariance = dc.variance;
    return (
      <div className="min-h-screen bg-gray-50 pb-28">
        <div className="bg-brand-600 text-white px-5 pt-12 pb-5">
          <h1 className="text-xl font-bold">Day Close</h1>
          <p className="text-brand-200 text-xs mt-0.5">{formatDate(today)}</p>
        </div>

        <div className="px-4 pt-4">
          {/* Closed badge */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-4 mb-4">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-bold text-green-800">Day Closed</p>
              <p className="text-xs text-green-600 mt-0.5">
                Closed at {formatDateTime(new Date(dc.closed_at))}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2 mb-4">
            <StatRow label="Total Sales"   value={formatCurrency(dc.total_sales)} accent />
            <StatRow label="Bills"         value={String(dc.bills_count)} />
            <StatRow label="Cash Sales"    value={formatCurrency(dc.total_cash)} />
            <StatRow label="UPI Sales"     value={formatCurrency(dc.total_upi)} />
            <StatRow label="Card Sales"    value={formatCurrency(dc.total_card)} />
          </div>

          {/* Cash reconciliation */}
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2 mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider py-2">Cash Reconciliation</p>
            <StatRow label="Opening Cash"  value={formatCurrency(dc.opening_cash)} />
            <StatRow label="Cash Sales"    value={formatCurrency(dc.total_cash)} />
            <StatRow label="Expected Cash" value={formatCurrency(dc.opening_cash + dc.total_cash)} />
            <StatRow label="Closing Cash"  value={formatCurrency(dc.closing_cash)} />
            <div className={`-mx-4 px-4 py-3 mt-1 rounded-b-2xl
              ${dcVariance === 0 ? 'bg-green-50' : dcVariance > 0 ? 'bg-blue-50' : 'bg-red-50'}`}
            >
              <div className="flex justify-between items-center">
                <p className={`text-sm font-bold ${dcVariance === 0 ? 'text-green-700' : dcVariance > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  Variance
                </p>
                <p className={`text-lg font-bold font-mono ${dcVariance === 0 ? 'text-green-700' : dcVariance > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {dcVariance >= 0 ? '+' : ''}{formatCurrency(dcVariance)}
                </p>
              </div>
              <p className={`text-xs mt-0.5 ${dcVariance === 0 ? 'text-green-600' : dcVariance > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {dcVariance === 0 ? 'Cash balanced ✓' : dcVariance > 0 ? 'Cash surplus' : 'Cash shortage'}
              </p>
            </div>
          </div>

          {dc.notes && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{dc.notes}</p>
            </div>
          )}

          {/* Reprint Z */}
          <div className="flex gap-3">
            <button
              onClick={() => handleReprintZ(dc)}
              className="flex-1 h-12 bg-gray-900 text-white rounded-2xl font-semibold text-sm
                         flex items-center justify-center gap-2 active:bg-gray-800"
            >
              🖨️ Print Z Report
            </button>
            <button
              onClick={() => printZReportHtml({
                date: new Date(dc.date + 'T00:00:00'),
                closedAt: new Date(dc.closed_at),
                openingCash: dc.opening_cash,
                totalSales: dc.total_sales, billCount: dc.bills_count, cancelledCount: 0,
                cashSales: dc.total_cash, cashCount: 0,
                upiSales: dc.total_upi,   upiCount: 0,
                cardSales: dc.total_card, cardCount: 0,
                expectedCash: dc.opening_cash + dc.total_cash,
                closingCash: dc.closing_cash,
                variance: dc.variance, notes: dc.notes,
              })}
              className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm
                         flex items-center justify-center gap-2 active:bg-gray-200"
            >
              🖥️ PDF / Print
            </button>
          </div>
        </div>

        <PrintResultSheet
          open={printOpen} status={status} lastError={lastError} copies={1}
          onRetry={() => handleReprintZ(dc)}
          onPdfFallback={() => { setPrintOpen(false); handleReprintZ(dc); }}
          onClose={() => setPrintOpen(false)}
        />
      </div>
    );
  }

  // ── Open (not yet closed) ─────────────────────────────────────────────────

  const varianceColor = variance === 0 ? 'text-green-700' : variance > 0 ? 'text-blue-700' : 'text-red-600';
  const varianceBg    = variance === 0 ? 'bg-green-50 border-green-200' : variance > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200';
  const varianceLabel = variance === 0 ? 'Balanced ✓' : variance > 0 ? 'Surplus' : 'Shortage';

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="bg-brand-600 text-white px-5 pt-12 pb-5">
        <h1 className="text-xl font-bold">Day Close</h1>
        <p className="text-brand-200 text-xs mt-0.5">{formatDate(today)}</p>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Today's sales summary */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider py-2">Today's Sales</p>
          <StatRow label="Total Sales" value={formatCurrency(totalSales)} accent />
          <StatRow label="Bills Saved" value={String(billCount)} />
          {cancelled.length > 0 && (
            <StatRow label="Cancelled" value={String(cancelled.length)} sub="not included in sales" />
          )}
        </div>

        {/* Payment breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider py-2">Payment Breakdown</p>
          {cashCount > 0  && <StatRow label={`Cash (${cashCount} bills)`}  value={formatCurrency(cashSales)} />}
          {upiCount  > 0  && <StatRow label={`UPI (${upiCount} bills)`}    value={formatCurrency(upiSales)} />}
          {cardCount > 0  && <StatRow label={`Card (${cardCount} bills)`}  value={formatCurrency(cardSales)} />}
          {billCount === 0 && <p className="text-sm text-gray-400 py-3 text-center">No bills today</p>}
        </div>

        {/* Cash reconciliation inputs */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cash Reconciliation</p>

          <CashInput
            label="Opening Cash"
            value={openingCash}
            onChange={setOpeningCash}
            hint="Auto-filled from yesterday's close. Edit if different."
          />

          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Cash Sales Today</p>
              <p className="text-sm font-bold font-mono text-gray-900">{formatCurrency(cashSales)}</p>
            </div>
            <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-700">Expected in Drawer</p>
              <p className="text-sm font-bold font-mono text-brand-700">{formatCurrency(expectedCash)}</p>
            </div>
          </div>

          <CashInput
            label="Closing Cash (count your drawer)"
            value={closingCash}
            onChange={v => { setClosingCash(v); setClosingError(''); }}
            error={closingError}
            hint="Count the physical cash in your drawer and enter the total."
          />

          {/* Live variance */}
          <div className={`border rounded-2xl px-4 py-3 ${varianceBg}`}>
            <div className="flex justify-between items-center">
              <p className={`text-sm font-bold ${varianceColor}`}>Variance ({varianceLabel})</p>
              <p className={`text-xl font-bold font-mono ${varianceColor}`}>
                {variance >= 0 ? '+' : ''}{formatCurrency(Math.abs(variance))}
              </p>
            </div>
            <p className={`text-xs mt-1 ${varianceColor} opacity-75`}>
              {variance === 0
                ? 'Cash matches exactly'
                : variance > 0
                  ? `₹${Math.abs(variance).toFixed(2)} more cash than expected`
                  : `₹${Math.abs(variance).toFixed(2)} less cash than expected`}
            </p>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
          <label className="text-sm font-semibold text-gray-700">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any remarks for this day close…"
            rows={2}
            maxLength={200}
            className="w-full mt-2 px-4 py-3 border border-gray-200 rounded-2xl text-sm outline-none
                       focus:border-brand-400 resize-none"
          />
        </div>

        {/* Close button */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={saving}
          className="w-full h-14 bg-brand-600 text-white rounded-2xl font-bold text-base shadow-lg
                     flex items-center justify-center gap-2 active:bg-brand-700 active:scale-[0.98]
                     transition-all disabled:opacity-50"
        >
          {saving ? 'Closing Day…' : '📅 Close Day & Print Z Report'}
        </button>

        <p className="text-xs text-gray-400 text-center pb-2">
          This locks all today's bills and cannot be undone.
        </p>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={showConfirm}
        title="Close the day?"
        message={`This will lock all ${billCount} bill${billCount !== 1 ? 's' : ''} from today. Bills cannot be cancelled after day close. This cannot be undone.`}
        confirmLabel="Close Day"
        confirmDestructive={false}
        onConfirm={handleSave}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Print result */}
      <PrintResultSheet
        open={printOpen} status={status} lastError={lastError} copies={1}
        onRetry={async () => {
          const bytes = buildZReportBytes(buildZData(new Date()));
          await printerService.print(bytes, 1);
        }}
        onPdfFallback={() => { setPrintOpen(false); printZReportHtml(buildZData(new Date())); }}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
