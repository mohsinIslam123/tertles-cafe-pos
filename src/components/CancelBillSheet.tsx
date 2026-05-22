import { useState, useEffect } from 'react';
import { db, type Invoice } from '../db';
import { toISODateString } from '../utils/format';

interface CancelBillSheetProps {
  invoice: Invoice | null;
  onCancelled: (updatedInvoice: Invoice) => void;
  onClose: () => void;
}

export default function CancelBillSheet({ invoice, onCancelled, onClose }: CancelBillSheetProps) {
  const [reason, setReason]   = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [dayLocked, setDayLocked] = useState(false);

  const open = !!invoice;

  useEffect(() => {
    if (!open || !invoice) return;
    setReason('');
    setError('');
    setDayLocked(false);

    // Check if the bill's day is already closed
    const dateStr = toISODateString(new Date(invoice.created_at));
    db.day_closes.where('date').equals(dateStr).first().then(dc => {
      setDayLocked(!!dc);
    });
  }, [open, invoice]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || !invoice) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) { setError('Reason is required.'); return; }

    setSaving(true);
    try {
      const now = new Date();

      await db.transaction('rw', [db.invoices, db.customers], async () => {
        await db.invoices.update(invoice.id!, {
          status:       'cancelled',
          cancelled_at: now,
          cancel_reason: reason.trim(),
        });

        // Revert customer total_spent
        if (invoice.customer_id) {
          const customer = await db.customers.get(invoice.customer_id);
          if (customer) {
            const newSpent = Math.max(0, (customer.total_spent ?? 0) - invoice.total);
            await db.customers.update(invoice.customer_id, { total_spent: newSpent });
          }
        }
      });

      const updated = await db.invoices.get(invoice.id!) as Invoice;
      onCancelled(updated);
    } catch {
      setError('Cancel failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-4 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-xl flex-none">
            🚫
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Cancel Bill?</h2>
            <p className="text-xs text-gray-400 font-mono">{invoice.invoice_number}</p>
          </div>
        </div>

        {dayLocked ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 mb-4">
            <p className="text-sm font-semibold text-amber-800">Cannot Cancel</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              This bill's day has been closed. Closed-day bills cannot be cancelled.
              Speak to your accountant if a correction is needed.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-red-700 leading-relaxed">
                Cancelling a bill cannot be undone. The invoice number will be
                kept but marked VOID. Customer total will be adjusted.
              </p>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">
                Reason for cancellation <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Customer changed order, duplicate bill…"
                value={reason}
                onChange={e => { setReason(e.target.value); setError(''); }}
                className="w-full h-12 px-4 mt-1.5 border border-gray-200 rounded-2xl text-sm
                           outline-none focus:border-red-400 bg-white"
                autoFocus
                maxLength={120}
              />
              {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm active:bg-gray-200"
              >
                Keep Bill
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 h-12 bg-red-500 text-white rounded-2xl font-semibold text-sm
                           active:bg-red-600 disabled:opacity-50"
              >
                {saving ? 'Cancelling…' : 'Cancel Bill'}
              </button>
            </div>
          </>
        )}

        {dayLocked && (
          <button
            onClick={onClose}
            className="w-full h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm active:bg-gray-200"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
