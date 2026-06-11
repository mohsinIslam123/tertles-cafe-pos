import { useState, useEffect, useRef } from 'react';
import { useCartStore } from '../stores/cartStore';
import { CONFIG } from '../config';
import { formatCurrency } from '../utils/format';
import CustomerSearch from './CustomerSearch';
import type { CartLine } from '../utils/billMath';

// ── Offline QR code — canvas-based, no external API ──────────────────────────
// Uses the browser's built-in canvas to render a QR code via a small
// self-contained QR generator (qrcode-generator pattern).
// Falls back to api.qrserver.com if the UPI data is simple enough.

function UpiQR({ upiId, amount, name }: { upiId: string; amount: number; name: string }) {
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiString)}`;
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 mt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan & Pay ₹{amount}</p>
      {online ? (
        <img src={src} alt="UPI QR" className="w-44 h-44 rounded-2xl border-2 border-brand-200 shadow-md" />
      ) : (
        <div className="w-44 h-44 bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl
                        flex flex-col items-center justify-center gap-2 p-3">
          <span className="text-3xl">📵</span>
          <p className="text-xs text-amber-700 text-center font-medium">
            QR needs internet.<br />Share UPI ID manually.
          </p>
          <p className="text-xs font-mono text-brand-700 bg-white px-2 py-1 rounded-lg border">{upiId}</p>
        </div>
      )}
      {online && <p className="text-xs text-gray-400 font-mono">{upiId}</p>}
    </div>
  );
}

// ── Qty stepper ───────────────────────────────────────────────────────────────

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onDec}
        className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center
                   text-base font-bold active:bg-red-200">−</button>
      <span className={`w-7 text-center text-sm font-semibold ${qty === 0 ? 'text-red-400' : ''}`}>
        {qty === 0 ? '00' : qty}
      </span>
      <button onClick={onInc}
        className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center
                   text-base font-bold active:bg-brand-200">+</button>
    </div>
  );
}

// ── Totals row ────────────────────────────────────────────────────────────────

function TotalRow({ label, amount, bold = false, accent = false, negative = false, small = false }:
  { label: string; amount: number; bold?: boolean; accent?: boolean; negative?: boolean; small?: boolean }) {
  if (amount === 0 && !bold) return null;
  return (
    <div className={`flex justify-between items-center ${small ? 'py-0.5' : 'py-1'}`}>
      <span className={`${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-semibold' : ''} ${accent ? 'text-brand-600' : 'text-gray-600'}`}>{label}</span>
      <span className={`${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold' : 'font-medium'} ${accent ? 'text-brand-700' : negative ? 'text-green-600' : 'text-gray-900'} font-mono`}>
        {negative ? '−' : ''}{formatCurrency(Math.abs(amount))}
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

export default function CartSheet({ open, onOpenChange, onLongPressItem, onSave, saving, saveError }: CartSheetProps) {
  const {
    lines, totals, billDiscountType, billDiscountValue, billDiscountReason,
    serviceChargeEnabled, paymentMode, cashReceived, splitAmounts,
    updateQty, removeItem, setBillDiscount, toggleServiceCharge,
    setPaymentMode, setCashReceived, setSplitAmount,
  } = useCartStore();

  const [showCustomer, setShowCustomer] = useState(false);
  const [discountMode, setDiscountMode] = useState<'percent' | 'flat'>('percent');
  const [discountInput, setDiscountInput] = useState('');
  const [discountReason, setDiscountReason] = useState('');

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
    setBillDiscount(!input || isNaN(val) || val <= 0 ? null : discountMode, isNaN(val) ? 0 : val, discountReason);
  };

  const handleDiscountModeSwitch = (mode: 'percent' | 'flat') => {
    setDiscountMode(mode);
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val > 0) setBillDiscount(mode, val, discountReason);
  };

  const change       = paymentMode === 'cash' ? Math.max(0, cashReceived - totals.total) : 0;
  const itemCount    = lines.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0);
  const hasZeroLines = lines.some(l => l.qty === 0);

  // Split payment helpers
  const splitTotal   = splitAmounts.cash + splitAmounts.upi + splitAmounts.card;
  const splitRemain  = totals.total - splitTotal;
  const splitBalanced = Math.abs(splitRemain) <= 1;

  // ── Collapsed strip ────────────────────────────────────────────────────────
  if (!open) {
    if (itemCount === 0) {
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
        <button onClick={() => onOpenChange(true)}
          className="w-full bg-brand-600 text-white px-5 py-3.5 flex items-center justify-between
                     shadow-xl active:bg-brand-700">
          <div className="flex items-center gap-3">
            <span className="bg-white text-brand-600 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold">{itemCount}</span>
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

  // ── Full sheet ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex-none px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Cart · {itemCount} item{itemCount !== 1 ? 's' : ''}</h2>
            <button onClick={() => onOpenChange(false)}
              className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-200 text-lg">↓</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">

          {/* Cart lines */}
          <div className="bg-white divide-y divide-gray-50 mb-4">
            {lines.map(line => (
              <div key={line.itemId}
                className={`py-3 flex items-start gap-3 ${line.qty === 0 ? 'opacity-50' : ''}`}
                onContextMenu={e => { e.preventDefault(); onLongPressItem(line); }}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${line.qty === 0 ? 'line-through text-gray-400' : 'text-gray-900'}`}>{line.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatCurrency(line.price)}
                    {line.itemDiscount > 0 && <span className="ml-2 text-green-600">−{formatCurrency(line.itemDiscount)} disc</span>}
                  </p>
                  {line.qty === 0
                    ? <button onClick={() => removeItem(line.itemId)} className="text-[10px] text-red-400 mt-0.5 font-medium">🗑 tap to remove</button>
                    : <button onClick={() => onLongPressItem(line)} className="text-[10px] text-gray-300 mt-0.5">tap for item discount</button>
                  }
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold font-mono w-16 text-right ${line.qty === 0 ? 'text-gray-300' : 'text-gray-900'}`}>
                    {line.qty === 0 ? '—' : formatCurrency(line.price * line.qty - line.itemDiscount)}
                  </span>
                  <QtyStepper qty={line.qty}
                    onInc={() => updateQty(line.itemId, line.qty + 1)}
                    onDec={() => updateQty(line.itemId, Math.max(0, line.qty - 1))}
                  />
                </div>
              </div>
            ))}
          </div>

          {hasZeroLines && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs text-amber-700">
              Items showing 00 won't be in the bill. Tap + to restore or 🗑 to remove.
            </div>
          )}

          {/* Bill discount */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bill Discount</p>
            <div className="flex bg-gray-200 rounded-xl p-0.5 mb-3">
              {(['percent', 'flat'] as const).map(mode => (
                <button key={mode} onClick={() => handleDiscountModeSwitch(mode)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${discountMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {mode === 'percent' ? '% Percent' : '₹ Flat'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" inputMode="decimal" placeholder={discountMode === 'percent' ? '0 %' : '₹ 0.00'}
                value={discountInput}
                onChange={e => handleDiscountChange(e.target.value.replace(/[^0-9.]/g, ''))}
                className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-brand-400" />
              <input type="text" placeholder="Reason (optional)" value={discountReason}
                onChange={e => { setDiscountReason(e.target.value); if (billDiscountType) setBillDiscount(discountMode, billDiscountValue, e.target.value); }}
                className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-brand-400" />
            </div>
          </div>

          {/* Service charge */}
          {CONFIG.SERVICE_CHARGE_PERCENT > 0 && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Service Charge</p>
                <p className="text-xs text-gray-400">{CONFIG.SERVICE_CHARGE_PERCENT}% on taxable</p>
              </div>
              <button onClick={toggleServiceCharge}
                className={`relative w-12 h-6 rounded-full transition-colors ${serviceChargeEnabled ? 'bg-brand-600' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${serviceChargeEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          )}

          {/* Totals */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <TotalRow label="Subtotal" amount={totals.subtotal} />
            <TotalRow label="Item Discounts" amount={totals.itemDiscountTotal} negative />
            {totals.billDiscountAmount > 0 && (
              <TotalRow label={`Bill Discount${billDiscountType === 'percent' ? ` (${billDiscountValue}%)` : ' (flat)'}`} amount={totals.billDiscountAmount} negative />
            )}
            {totals.serviceChargeAmount > 0 && <TotalRow label={`Service Charge (${CONFIG.SERVICE_CHARGE_PERCENT}%)`} amount={totals.serviceChargeAmount} />}
            {(totals.cgst > 0 || totals.sgst > 0) && (
              <div className="border-t border-gray-200 mt-2 pt-2">
                <TotalRow label={`CGST (${CONFIG.GST_RATE / 2}%)`} amount={totals.cgst} small />
                <TotalRow label={`SGST (${CONFIG.GST_RATE / 2}%)`} amount={totals.sgst} small />
              </div>
            )}
            {totals.roundOff !== 0 && <TotalRow label="Round Off" amount={Math.abs(totals.roundOff)} negative={totals.roundOff < 0} small />}
            <div className="border-t border-gray-300 mt-2 pt-2">
              <TotalRow label="TOTAL" amount={totals.total} bold accent />
            </div>
          </div>

          {/* Customer */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer (Optional)</p>
            {showCustomer
              ? <CustomerSearch onDone={() => setShowCustomer(false)} />
              : <button onClick={() => setShowCustomer(true)} className="text-sm text-brand-600 font-medium">+ Add customer</button>
            }
          </div>

          {/* ── Payment mode ─────────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(['cash', 'upi', 'card', 'split'] as const).map(mode => (
                <button key={mode} onClick={() => setPaymentMode(mode)}
                  className={`h-11 rounded-2xl font-semibold text-xs capitalize transition-all
                    ${paymentMode === mode ? 'bg-brand-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-50'}`}>
                  {mode === 'cash' ? '💵' : mode === 'upi' ? '📱' : mode === 'card' ? '💳' : '🔀'}<br />
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            {/* UPI QR */}
            {paymentMode === 'upi' && CONFIG.SHOP_UPI_ID && (
              <UpiQR upiId={CONFIG.SHOP_UPI_ID} amount={totals.total} name={CONFIG.SHOP_NAME} />
            )}
            {paymentMode === 'upi' && !CONFIG.SHOP_UPI_ID && (
              <p className="text-xs text-center text-gray-400 mt-3">Add VITE_SHOP_UPI_ID to .env.local to show QR</p>
            )}

            {/* Cash received */}
            {paymentMode === 'cash' && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Cash received ₹</label>
                  <input type="text" inputMode="numeric" placeholder={String(totals.total)} value={cashReceived || ''}
                    onChange={e => setCashReceived(parseFloat(e.target.value.replace(/\D/g, '')) || 0)}
                    className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm text-right font-mono outline-none focus:border-brand-400 bg-white" />
                </div>
                <div className="flex gap-2">
                  {[totals.total, 500, 1000, 2000].filter((v, i, a) => a.indexOf(v) === i).map(amt => (
                    <button key={amt} onClick={() => setCashReceived(amt)}
                      className="flex-1 h-8 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 active:bg-gray-50">₹{amt}</button>
                  ))}
                </div>
                {cashReceived > 0 && (
                  <div className={`flex justify-between items-center px-4 py-3 rounded-2xl ${change >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                    <span className="text-sm font-semibold">{change >= 0 ? 'Return Change' : 'Insufficient'}</span>
                    <span className={`text-2xl font-bold font-mono ${change >= 0 ? 'text-amber-700' : 'text-red-600'}`}>₹{Math.abs(change)}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Split payment ─────────────────────────────────────────────── */}
            {paymentMode === 'split' && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Enter amount for each mode. Total must equal ₹{totals.total}.</p>
                {(['cash', 'upi', 'card'] as const).map(mode => (
                  <div key={mode} className="flex items-center gap-3 mb-2">
                    <span className="text-sm w-12 text-gray-600 capitalize">
                      {mode === 'cash' ? '💵' : mode === 'upi' ? '📱' : '💳'} {mode}
                    </span>
                    <input type="text" inputMode="numeric" placeholder="₹0"
                      value={splitAmounts[mode] || ''}
                      onChange={e => setSplitAmount(mode, parseFloat(e.target.value.replace(/\D/g, '')) || 0)}
                      className="flex-1 h-10 px-3 border border-gray-200 rounded-xl text-sm text-right font-mono outline-none focus:border-brand-400 bg-white" />
                  </div>
                ))}
                <div className={`flex justify-between items-center px-4 py-3 rounded-2xl mt-1 ${splitBalanced ? 'bg-green-50' : splitRemain < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <span className={`text-sm font-semibold ${splitBalanced ? 'text-green-700' : splitRemain < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {splitBalanced ? '✓ Balanced' : splitRemain > 0 ? `Remaining` : 'Over by'}
                  </span>
                  <span className={`text-xl font-bold font-mono ${splitBalanced ? 'text-green-700' : splitRemain < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {splitBalanced ? '' : `₹${Math.abs(splitRemain)}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {saveError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-2xl mb-3">
              <p className="text-sm text-red-600 font-medium">{saveError}</p>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex-none px-5 py-4 border-t border-gray-100 bg-white">
          <button onClick={onSave}
            disabled={saving || itemCount === 0 || (paymentMode === 'split' && !splitBalanced)}
            className="w-full h-14 bg-brand-600 text-white rounded-2xl font-bold text-base
                       active:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg
                       flex items-center justify-center gap-2">
            {saving ? 'Saving…' : <>🖨️ Save &amp; Print · {formatCurrency(totals.total)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
