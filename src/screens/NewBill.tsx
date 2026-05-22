import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemsStore } from '../stores/itemsStore';
import { useCartStore } from '../stores/cartStore';
import { db, type InvoiceItem } from '../db';
import type { Item } from '../db';
import type { CartLine } from '../utils/billMath';
import CartSheet from '../components/CartSheet';
import ItemDiscountSheet from '../components/ItemDiscountSheet';
import SaveSuccessSheet from '../components/SaveSuccessSheet';
import ConfirmDialog from '../components/ConfirmDialog';

// ── Veg dot ───────────────────────────────────────────────────────────────────

function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full flex-none ${isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
  );
}

// ── Item tile ─────────────────────────────────────────────────────────────────

function ItemTile({
  item,
  qtyInCart,
  onAdd,
}: {
  item: Item;
  qtyInCart: number;
  onAdd: (item: Item) => void;
}) {
  const outOfStock = !item.in_stock;

  return (
    <button
      onClick={() => !outOfStock && onAdd(item)}
      disabled={outOfStock}
      className={`
        relative flex flex-col gap-1.5 p-3 rounded-2xl border text-left
        transition-all duration-100 active:scale-[0.96]
        ${outOfStock
          ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
          : qtyInCart > 0
            ? 'bg-brand-50 border-brand-200 shadow-sm'
            : 'bg-white border-gray-100 shadow-sm active:bg-gray-50'
        }
      `}
    >
      {/* Qty badge */}
      {qtyInCart > 0 && (
        <span className="absolute top-2 right-2 bg-brand-600 text-white text-[10px] font-bold
                         rounded-full w-5 h-5 flex items-center justify-center">
          {qtyInCart}
        </span>
      )}

      <div className="flex items-start gap-1.5">
        <VegDot isVeg={item.is_veg} />
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">
          {item.name}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono">{item.code}</p>
        <p className="text-sm font-bold text-gray-900">₹{item.price}</p>
      </div>

      {outOfStock && (
        <p className="text-[10px] text-gray-400 font-semibold">OUT OF STOCK</p>
      )}
    </button>
  );
}

// ── NewBill ───────────────────────────────────────────────────────────────────

export default function NewBill() {
  const navigate = useNavigate();
  const { categories, items, loadAll: loadItems } = useItemsStore();
  const {
    lines, nextInvoiceNumber, hasDraft,
    addItem, initCart, saveBill, saveDraft, loadDraft, clearCart,
  } = useCartStore();

  const [search, setSearch]             = useState('');
  const [activeCat, setActiveCat]       = useState<number | null>(null);
  const [cartOpen, setCartOpen]         = useState(false);
  const [discountTarget, setDiscountTarget] = useState<CartLine | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm]     = useState(false);
  const [showDraftPrompt, setShowDraftPrompt]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [savedInvoice, setSavedInvoice] = useState<Parameters<typeof SaveSuccessSheet>[0]['invoice']>(null);
  const [savedItems, setSavedItems]     = useState<InvoiceItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadItems();
    initCart().then(() => {
      // Show draft prompt only if there's a draft and cart is currently empty
      useCartStore.getState().hasDraft && setShowDraftPrompt(true);
    });
  }, []);

  // ── Auto-save draft on leave ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Save draft when unmounting (navigating away)
      const { lines } = useCartStore.getState();
      if (lines.length > 0) {
        useCartStore.getState().saveDraft();
      }
    };
  }, []);

  // ── Item grid (filtered) ─────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    let result = items;

    // Category filter
    if (activeCat !== null) {
      result = result.filter(it => it.category_id === activeCat);
    }

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(it =>
        it.name.toLowerCase().includes(q) ||
        it.code.toLowerCase() === q
      );
    }

    return result;
  }, [items, activeCat, search]);

  // Build qty map for badges
  const qtyMap = useMemo(() => {
    const map = new Map<number, number>();
    lines.forEach(l => map.set(l.itemId, l.qty));
    return map;
  }, [lines]);

  // ── Code shortcut: exact code match + Enter ──────────────────────────────

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toUpperCase();
    if (!q) return;
    const match = items.find(it => it.code === q && it.in_stock);
    if (match) {
      addItem(match);
      setSearch('');
    }
  };

  // ── Save bill ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveError('');
    setSaving(true);
    try {
      const result = await saveBill();
      if (!result.ok) {
        setSaveError(result.reason ?? 'Save failed.');
        return;
      }
      // Fetch saved invoice items for WhatsApp share
      const invItems = await db.invoice_items
        .where('invoice_id')
        .equals(result.invoice!.id!)
        .toArray();
      setSavedInvoice(result.invoice!);
      setSavedItems(invItems);
      setCartOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Discard / back ────────────────────────────────────────────────────────

  const handleBackPress = () => {
    if (lines.length > 0) {
      setShowDiscardConfirm(true);
    } else {
      navigate('/');
    }
  };

  const handleDiscardConfirm = async () => {
    await clearCart();
    setShowDiscardConfirm(false);
    navigate('/');
  };

  const handleLoadDraft = async () => {
    await loadDraft();
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = async () => {
    await clearCart();
    setShowDraftPrompt(false);
  };

  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-none bg-brand-600 text-white px-4 pt-12 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackPress}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-500
                       active:bg-brand-400 text-xl"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">New Bill</h1>
            <p className="text-brand-200 text-xs font-mono">{nextInvoiceNumber}</p>
          </div>
          {lines.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-brand-300 px-2 py-1 border border-brand-500 rounded-lg
                         active:bg-brand-500"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="flex-none px-4 py-2.5 bg-white border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search item or type code + Enter"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-10 pl-9 pr-9 bg-gray-50 border border-gray-200 rounded-xl text-sm
                       outline-none focus:border-brand-400 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Category chips ─────────────────────────────────────────────────── */}
      {categories.length > 1 && (
        <div className="flex-none px-4 py-2 bg-white border-b border-gray-100">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => setActiveCat(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                ${activeCat === null
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id!)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                  ${activeCat === cat.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Item grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-36">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl">🍽️</span>
            <p className="text-sm text-gray-500 text-center">
              No menu items yet.
            </p>
            <button
              onClick={() => navigate('/items')}
              className="text-sm text-brand-600 font-medium"
            >
              Go to Items →
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-gray-400">No items match "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm text-brand-600 font-medium">
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map(item => (
              <ItemTile
                key={item.id}
                item={item}
                qtyInCart={qtyMap.get(item.id!) ?? 0}
                onAdd={addItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart strip / sheet ─────────────────────────────────────────────── */}
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onLongPressItem={setDiscountTarget}
        onSave={handleSave}
        saving={saving}
        saveError={saveError}
      />

      {/* ── Modals & dialogs ─────────────────────────────────────────────── */}

      <ItemDiscountSheet
        line={discountTarget}
        onClose={() => setDiscountTarget(null)}
      />

      <SaveSuccessSheet
        invoice={savedInvoice}
        items={savedItems}
        onClose={() => { setSavedInvoice(null); setSavedItems([]); }}
      />

      {/* Discard confirm */}
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard bill?"
        message="This bill will be saved as a draft. You can resume it next time."
        confirmLabel="Save Draft & Exit"
        confirmDestructive={false}
        onConfirm={async () => { await saveDraft(); setShowDiscardConfirm(false); navigate('/'); }}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      {/* Clear cart confirm */}
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear cart?"
        message={`Remove all ${itemCount} item${itemCount !== 1 ? 's' : ''} from this bill?`}
        confirmLabel="Clear"
        confirmDestructive
        onConfirm={async () => { await clearCart(); setShowClearConfirm(false); }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Draft resume prompt */}
      <ConfirmDialog
        open={showDraftPrompt}
        title="Resume draft?"
        message="You have a saved draft bill. Do you want to continue where you left off?"
        confirmLabel="Resume Draft"
        confirmDestructive={false}
        onConfirm={handleLoadDraft}
        onCancel={handleDiscardDraft}
      />
    </div>
  );
}
