import { useState, useEffect } from 'react';
import { useCartStore } from '../stores/cartStore';
import { CONFIG } from '../config';
import { formatCurrency } from '../utils/format';
import CustomerSearch from './CustomerSearch';
import type { CartLine } from '../utils/billMath';

// ── Qty stepper ───────────────────────────────────────────────────────────────

function QtyStepper({
  qty,
  onInc,
  onDec,
}: {
  qty: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onDec}
        className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center
                   text-base font-bold active:bg-gray-200 transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold">{qty}</span>
      <button
        onClick={onInc}
        className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center
                   text-base font-bold active:bg-brand-200 transition-colors"
      >
        +
      </button>
    </div>
  );
}

// ── Totals row ────────────────────────────────────────────────────────────────

function TotalRow({
  label,
  amount,
  bold = false,
  accent = false,
  negative = false,
  small = false,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  accent?: boolean;
  negative?: boolean;
  small?: boolean;
}) {
  if (amount === 0 && !bold) return null;
  const prefix = negative ? '−' : '';
  return (
    <div className={`flex justify-between items-center ${small ? 'py-0.5' : 'py-1'}`}>
      <span className={`${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-semibold' : 'font-normal'} ${accent ? 'text-brand-600' : 'text-gray-600'}`}>
        {label}
      </span>
      <span className={`${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold' : 'font-medium'} ${accent ? 'text-brand-700' : negative ? 'text-green-600' : 'text-gray-900'} font-mono`}>
        {prefix}{formatCurrency(Math.abs(amount))}
      </span>
    </div>
  );
}

// ── CartSheet ─────────────────────────────────────────────────────────────────

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLongPressItem: (line: CartLine) => void;
  onSave: () => void;
  saving: boolean;
  saveError: string;
}

export default function CartSheet({
  open,
  onOpenChange,
  onLongPressItem,
  onSave,
  saving,
  saveError,
}: CartSheetProps) {
  const {
    lines, totals, billDiscountType, billDiscountValue, billDiscountReason,
    serviceChargeEnabled, paymentMode, cashReceived,
    updateQty, removeItem, setBillDiscount, toggleServiceCharge,
    setPaymentMode, setCashReceived,
  } = useCartStore();

  const [showCustomer, setShowCustomer]   = useState(false);
  const [discountMode, setDiscountMode]   = useState<'percent' | 'flat'>('percent');
  const [discountInput, setDiscountInput] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Sync local discount state with store
  useEffect(() => {
    if (billDiscountType) {
      setDiscountMode(billDiscountType);
      setDiscountInput(String(billDiscountValue));
      setDiscountReason(billDiscountReason);
    } else {
      setDiscountInput('');
      setDiscountReason('');
    }
  }, [billDiscountType, billDiscountValue, billDiscountReason]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleDiscountChange = (input: string) => {
    setDiscountInput(input);
    const val = parseFloat(input);
    if (!input || isNaN(val) || val <= 0) {
      setBillDiscount(null, 0, '');
    } else {
      setBillDiscount(discountMode, val, discountReason);
    }
  };

  const handleDiscountModeSwitch = (mode: 'percent' | 'flat') => {
    setDiscountMode(mode);
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val > 0) {
      setBillDiscount(mode, val, discountReason);
    }
  };

  const change = paymentMode === 'cash' ? Math.max(0, cashReceived - totals.total) : 0;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  // ── Collapsed strip ────────────────────────────────────────────────────────

  if (!open) {
    if (lines.length === 0) {
      return (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 z-30">
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-center">
            <p className="text-sm text-gray-400">Cart is empty — tap items to add</p>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed bottom-16 left-0 right-0 z-30">
        <button
          onClick={() => onOpenChange(true)}
          className="w-full bg-brand-600 text-white px-5 py-3.5 flex items-center justify-between
                     shadow-xl active:bg-brand-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="bg-white text-brand-600 rounded-full w-7 h-7 flex items-center justify-center
                             text-xs font-bold">
              {itemCount}
            </span>
            <span className="text-sm font-medium">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">{formatCurrency(totals.total)}</span>
            <span className="text-brand-200 text-sm">Review & Pay ↑</span>
          </div>
        </button>
      </div>
    );
  }

  // ── Full cart sheet ────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      onClick={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl
                   flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex-none px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              Cart · {itemCount} item{itemCount !== 1 ? 's' : ''}
            </h2>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500
                         active:bg-gray-200 text-lg"
            >
              ↓
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">

          {/* ── Cart lines ──────────────────────────────────────────────────── */}
          <div className="bg-white divide-y divide-gray-50 mb-4">
            {lines.map(line => (
              <div
                key={line.itemId}
                className="py-3 flex items-start gap-3"
                onContextMenu={e => { e.preventDefault(); onLongPressItem(line); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{line.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatCurrency(line.price)}
                    {line.itemDiscount > 0 && (
                      <span className="ml-2 text-green-600">
                        −{formatCurrency(line.itemDiscount)} disc
                      </span>
                    )}
                  </p>
                  {/* Long press hint */}
                  <button
                    onClick={() => onLongPressItem(line)}
                    className="text-[10px] text-gray-300 mt-0.5"
                  >
                    tap for item discount
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900 font-mono w-16 text-right">
                    {formatCurrency(line.price * line.qty - line.itemDiscount)}
                  </span>
                  <QtyStepper
                    qty={line.qty}
                    onInc={() => updateQty(line.itemId, line.qty + 1)}
                    onDec={() => updateQty(line.itemId, line.qty - 1)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── Bill discount ────────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bill Discount</p>

            {/* Mode toggle */}
            <div className="flex bg-gray-200 rounded-xl p-0.5 mb-3">
              {(['percent', 'flat'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleDiscountModeSwitch(mode)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${discountMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  {mode === 'percent' ? '% Percent' : '₹ Flat'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder={discountMode === 'percent' ? '0 %' : '₹ 0.00'}
                value={discountInput}
                onChange={e => handleDiscountChange(e.target.value.replace(/[^0-9.]/g, ''))}
                className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white
                           outline-none focus:border-brand-400"
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={discountReason}
                onChange={e => {
                  setDiscountReason(e.target.value);
                  if (billDiscountType) setBillDiscount(discountMode, billDiscountValue, e.target.value);
                }}
                className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white
                           outline-none focus:border-brand-400"
              />
            </div>
          </div>

          {/* ── Service charge toggle ─────────────────────────────────────────── */}
          {CONFIG.SERVICE_CHARGE_PERCENT > 0 && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Service Charge</p>
                <p className="text-xs text-gray-400">{CONFIG.SERVICE_CHARGE_PERCENT}% on taxable amount</p>
              </div>
              <button
                onClick={toggleServiceCharge}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200
                  ${serviceChargeEnabled ? 'bg-brand-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow
                    transition-transform duration-200
                    ${serviceChargeEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>
          )}

          {/* ── Totals breakdown ──────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <TotalRow label="Subtotal" amount={totals.subtotal} />
            <TotalRow label="Item Discounts" amount={totals.itemDiscountTotal} negative />
            {totals.billDiscountAmount > 0 && (
              <TotalRow
                label={`Bill Discount${billDiscountType === 'percent' ? ` (${billDiscountValue}%)` : ' (flat)'}`}
                amount={totals.billDiscountAmount}
                negative
              />
            )}
            {totals.serviceChargeAmount > 0 && (
              <TotalRow label={`Service Charge (${CONFIG.SERVICE_CHARGE_PERCENT}%)`} amount={totals.serviceChargeAmount} />
            )}
            <div className="border-t border-gray-200 mt-2 pt-2">
              <TotalRow label={`CGST (${CONFIG.GST_RATE / 2}%)`} amount={totals.cgst} small />
              <TotalRow label={`SGST (${CONFIG.GST_RATE / 2}%)`} amount={totals.sgst} small />
            </div>
            {totals.roundOff !== 0 && (
              <TotalRow
                label="Round Off"
                amount={Math.abs(totals.roundOff)}
                negative={totals.roundOff < 0}
                small
              />
            )}
            <div className="border-t border-gray-300 mt-2 pt-2">
              <TotalRow label="TOTAL" amount={totals.total} bold accent />
            </div>
          </div>

          {/* ── Customer (optional) ───────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Customer (Optional)
            </p>
            {showCustomer ? (
              <CustomerSearch onDone={() => setShowCustomer(false)} />
            ) : (
              <button
                onClick={() => setShowCustomer(true)}
                className="text-sm text-brand-600 font-medium"
              >
                + Add customer
              </button>
            )}
          </div>

          {/* ── Payment mode ──────────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment</p>
            <div className="flex gap-2">
              {(['cash', 'upi', 'card'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  className={`flex-1 h-11 rounded-2xl font-semibold text-sm capitalize transition-all
                    ${paymentMode === mode
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-50'
                    }`}
                >
                  {mode === 'cash' ? '💵' : mode === 'upi' ? '📱' : '💳'} {mode.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Cash received + change */}
            {paymentMode === 'cash' && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Cash received ₹</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={String(totals.total)}
                    value={cashReceived || ''}
                    onChange={e => setCashReceived(parseFloat(e.target.value.replace(/\D/g, '')) || 0)}
                    className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm text-right
                               font-mono outline-none focus:border-brand-400 bg-white"
                  />
                </div>
                {/* Quick cash buttons */}
                <div className="flex gap-2">
                  {[totals.total, 500, 1000, 2000].filter((v, i, a) => a.indexOf(v) === i).map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashReceived(amt)}
                      className="flex-1 h-8 bg-white border border-gray-200 rounded-xl text-xs font-semibold
                                 text-gray-600 active:bg-gray-50"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
                {cashReceived > 0 && (
                  <div className={`flex justify-between items-center px-4 py-3 rounded-2xl
                    ${change >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                    <span className="text-sm font-semibold">
                      {change >= 0 ? 'Return Change' : 'Insufficient'}
                    </span>
                    <span className={`text-2xl font-bold font-mono ${change >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                      ₹{Math.abs(change)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {saveError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-2xl mb-3">
              <p className="text-sm text-red-600 font-medium">{saveError}</p>
            </div>
          )}
        </div>

        {/* ── Sticky save button ─────────────────────────────────────────────── */}
        <div className="flex-none px-5 py-4 border-t border-gray-100 bg-white">
          <button
            onClick={onSave}
            disabled={saving || lines.length === 0}
            className="w-full h-14 bg-brand-600 text-white rounded-2xl font-bold text-base
                       active:bg-brand-700 transition-all active:scale-[0.98]
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-lg
                       flex items-center justify-center gap-2"
          >
            {saving
              ? 'Saving…'
              : <>🖨️ Save &amp; Print · {formatCurrency(totals.total)}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
