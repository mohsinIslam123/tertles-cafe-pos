import { useEffect, useState, useMemo, useCallback } from 'react';
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
import KOTSheet from '../components/KOTSheet';

// ── Veg dot ───────────────────────────────────────────────────────────────────

function VegDot({ isVeg }: { isVeg: boolean }) {
  return <span className={`w-2 h-2 rounded-full flex-none ${isVeg ? 'bg-green-500' : 'bg-red-500'}`} />;
}

// ── Item tile ─────────────────────────────────────────────────────────────────

function ItemTile({
  item, qtyInCart, onAdd, onDec,
}: {
  item: Item; qtyInCart: number; onAdd: (item: Item) => void; onDec: (item: Item) => void;
}) {
  const outOfStock = !item.in_stock;

  return (
    <div
      className={`
        relative flex flex-col gap-1.5 p-3 rounded-2xl border text-left transition-all duration-100
        ${outOfStock
          ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
          : qtyInCart > 0
            ? 'bg-brand-50 border-brand-200 shadow-sm'
            : 'bg-white border-gray-100 shadow-sm'
        }
      `}
    >
      <div className="flex items-start gap-1.5">
        <VegDot isVeg={item.is_veg} />
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">{item.name}</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono">{item.code}</p>
        <p className="text-sm font-bold text-gray-900">₹{item.price}</p>
      </div>
      {outOfStock && <p className="text-[10px] text-gray-400 font-semibold">OUT OF STOCK</p>}
      {!outOfStock && (
        qtyInCart > 0 ? (
          <div className="flex items-center justify-between mt-1">
            <button
              onClick={e => { e.stopPropagation(); onDec(item); }}
              className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center
                         text-lg font-bold active:bg-red-200"
            >−</button>
            <span className="text-base font-bold text-brand-700 w-6 text-center">{qtyInCart}</span>
            <button
              onClick={e => { e.stopPropagation(); onAdd(item); }}
              className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center
                         text-lg font-bold active:bg-brand-200"
            >+</button>
          </div>
        ) : (
          <button
            onClick={() => onAdd(item)}
            className="mt-1 w-full h-8 bg-brand-600 text-white rounded-xl text-sm font-semibold
                       active:bg-brand-700 flex items-center justify-center"
          >+ Add</button>
        )
      )}
    </div>
  );
}

// ── NewBill ───────────────────────────────────────────────────────────────────

export default function NewBill() {
  const navigate = useNavigate();
  const { categories, items, loadAll: loadItems } = useItemsStore();
  const {
    lines, nextInvoiceNumber,
    addItem, updateQty, removeItem, initCart, saveBill, saveDraft, loadDraft, clearCart,
  } = useCartStore();

  const [search, setSearch]           = useState('');
  const [activeCat, setActiveCat]     = useState<number | null>(null);
  const [cartOpen, setCartOpen]       = useState(false);
  const [kotOpen, setKotOpen]         = useState(false);
  const [discountTarget, setDiscountTarget]         = useState<CartLine | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm]     = useState(false);
  const [showDraftPrompt, setShowDraftPrompt]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedInvoice, setSavedInvoice] = useState<Parameters<typeof SaveSuccessSheet>[0]['invoice']>(null);
  const [savedItems, setSavedItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    loadItems();
    initCart().then(() => {
      useCartStore.getState().hasDraft && setShowDraftPrompt(true);
    });
  }, []);

  // ── Filtered items ─────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = items;
    if (!q && activeCat !== null) result = result.filter(it => it.category_id === activeCat);
    if (q) result = result.filter(it => it.name.toLowerCase().includes(q) || it.code.toLowerCase() === q);
    return result;
  }, [items, activeCat, search]);

  const qtyMap = useMemo(() => {
    const map = new Map<number, number>();
    lines.forEach(l => map.set(l.itemId, l.qty));
    return map;
  }, [lines]);

  // Search → auto-clear category
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val.trim()) setActiveCat(null);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toUpperCase();
    const match = items.find(it => it.code === q && it.in_stock);
    if (match) { addItem(match); setSearch(''); }
  };

  const handleAdd = useCallback((item: Item) => addItem(item), [addItem]);

  const handleDec = useCallback((item: Item) => {
    const current = useCartStore.getState().lines.find(l => l.itemId === item.id!);
    if (!current) return;
    if (current.qty <= 1) removeItem(item.id!);
    else updateQty(item.id!, current.qty - 1);
  }, [removeItem, updateQty]);

  const handleSave = async () => {
    setSaveError(''); setSaving(true);
    try {
      const result = await saveBill();
      if (!result.ok) { setSaveError(result.reason ?? 'Save failed.'); return; }
      const invItems = await db.invoice_items.where('invoice_id').equals(result.invoice!.id!).toArray();
      setSavedInvoice(result.invoice!);
      setSavedItems(invItems);
      setCartOpen(false);
    } finally { setSaving(false); }
  };

  const handleBackPress = () => {
    const active = lines.filter(l => l.qty > 0);
    if (active.length > 0) setShowDiscardConfirm(true);
    else navigate('/');
  };

  const itemCount = lines.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-none bg-brand-600 text-white px-4 pt-12 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackPress}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-500 active:bg-brand-400 text-xl"
          >←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">New Bill</h1>
            <p className="text-brand-200 text-xs font-mono truncate">{nextInvoiceNumber}</p>
          </div>
          {/* KOT button — always visible if items in cart */}
          {itemCount > 0 && (
            <button
              onClick={() => setKotOpen(true)}
              className="text-xs font-bold bg-orange-500 text-white px-3 py-2 rounded-xl
                         active:bg-orange-600 shadow-md whitespace-nowrap"
            >
              👨‍🍳 KOT
            </button>
          )}
          {lines.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-bold bg-red-500 text-white px-3 py-2 rounded-xl
                         active:bg-red-600 shadow-md"
            >
              🗑 Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="flex-none px-4 py-2.5 bg-white border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search item or type code + Enter"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-10 pl-9 pr-9 bg-gray-50 border border-gray-200 rounded-xl text-sm
                       outline-none focus:border-brand-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">×</button>
          )}
        </div>
      </div>

      {/* ── Category chips ─────────────────────────────────────────────────── */}
      {categories.length > 1 && !search && (
        <div className="flex-none px-4 py-2 bg-white border-b border-gray-100">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => setActiveCat(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-none
                ${activeCat === null ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >All</button>
            {categories.map(cat => (
              <button key={cat.id}
                onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id!)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-none
                  ${activeCat === cat.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >{cat.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Item grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-36">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl">🍽️</span>
            <p className="text-sm text-gray-500">No menu items yet.</p>
            <button onClick={() => navigate('/items')} className="text-sm text-brand-600 font-medium">
              Go to Items →
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-gray-400">No items match "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm text-brand-600 font-medium">Clear search</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map(item => (
              <ItemTile key={item.id} item={item}
                qtyInCart={qtyMap.get(item.id!) ?? 0}
                onAdd={handleAdd} onDec={handleDec}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Sheets ─────────────────────────────────────────────────────────── */}
      <CartSheet open={cartOpen} onOpenChange={setCartOpen}
        onLongPressItem={setDiscountTarget} onSave={handleSave}
        saving={saving} saveError={saveError}
      />
      <ItemDiscountSheet line={discountTarget} onClose={() => setDiscountTarget(null)} />
      <SaveSuccessSheet invoice={savedInvoice} items={savedItems}
        onClose={() => { setSavedInvoice(null); setSavedItems([]); }}
      />
      <KOTSheet open={kotOpen} lines={lines} invoiceNumber={nextInvoiceNumber}
        onClose={() => setKotOpen(false)}
      />

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Exit billing?"
        message="What do you want to do with this bill?"
        confirmLabel="Clear & Exit"
        cancelLabel="Save as Draft"
        confirmDestructive
        onConfirm={async () => { await clearCart(); setShowDiscardConfirm(false); navigate('/'); }}
        onCancel={async () => { await saveDraft(); setShowDiscardConfirm(false); navigate('/'); }}
      />
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear cart?"
        message={`Remove all ${itemCount} items from this bill?`}
        confirmLabel="Clear"
        confirmDestructive
        onConfirm={async () => { await clearCart(); setShowClearConfirm(false); }}
        onCancel={() => setShowClearConfirm(false)}
      />
      <ConfirmDialog
        open={showDraftPrompt}
        title="Resume draft?"
        message="You have a saved draft. Continue where you left off?"
        confirmLabel="Resume Draft"
        onConfirm={async () => { await loadDraft(); setShowDraftPrompt(false); }}
        onCancel={async () => { await clearCart(); setShowDraftPrompt(false); }}
      />
    </div>
  );
}
