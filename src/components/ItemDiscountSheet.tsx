import { useState, useEffect } from 'react';
import { useCartStore } from '../stores/cartStore';
import { formatCurrency } from '../utils/format';
import type { CartLine } from '../utils/billMath';

interface ItemDiscountSheetProps {
  line: CartLine | null;
  onClose: () => void;
}

export default function ItemDiscountSheet({ line, onClose }: ItemDiscountSheetProps) {
  const { setItemDiscount } = useCartStore();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const open = !!line;

  useEffect(() => {
    if (open && line) {
      setValue(line.itemDiscount > 0 ? String(line.itemDiscount) : '');
      setError('');
    }
  }, [open, line]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || !line) return null;

  const maxDiscount = line.price * line.qty;

  const handleApply = () => {
    const num = parseFloat(value || '0');
    if (isNaN(num) || num < 0) { setError('Enter a valid amount.'); return; }
    if (num > maxDiscount) {
      setError(`Max discount for this item is ${formatCurrency(maxDiscount)}.`);
      return;
    }
    setItemDiscount(line.itemId, num);
    onClose();
  };

  const handleRemove = () => {
    setItemDiscount(line.itemId, 0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-4 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-base font-bold text-gray-900">Item Discount</h2>
        <p className="text-sm text-gray-500 mt-0.5 truncate">{line.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {line.qty} × {formatCurrency(line.price)} = {formatCurrency(maxDiscount)}
        </p>

        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700">Flat discount (₹)</label>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => { setValue(e.target.value.replace(/[^0-9.]/g, '')); setError(''); }}
            placeholder="0.00"
            className="w-full h-12 px-4 mt-1.5 rounded-2xl border border-gray-200 focus:border-brand-500
                       text-sm font-medium outline-none"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleApply()}
          />
          {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
        </div>

        <div className="flex gap-3 mt-5">
          {line.itemDiscount > 0 && (
            <button
              onClick={handleRemove}
              className="flex-1 h-12 bg-red-50 text-red-500 rounded-2xl font-semibold text-sm active:bg-red-100"
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm active:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 h-12 bg-brand-600 text-white rounded-2xl font-semibold text-sm active:bg-brand-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
