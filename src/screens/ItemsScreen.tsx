import { useEffect, useState, useMemo } from 'react';
import { useItemsStore } from '../stores/itemsStore';
import { useNavigate } from 'react-router-dom';
import type { Category, Item } from '../db';
import ConfirmDialog from '../components/ConfirmDialog';
import CategoryForm from '../components/CategoryForm';
import ItemForm from '../components/ItemForm';
import { formatCurrency } from '../utils/format';

// ── Veg indicator dot ────────────────────────────────────────────────────────

function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-none mt-0.5 ${
        isVeg ? 'bg-green-500' : 'bg-red-500'
      }`}
    />
  );
}

// ── Single item row ───────────────────────────────────────────────────────────

function ItemRow({
  item,
  onEdit,
  onDelete,
  onToggleStock,
}: {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onToggleStock: (item: Item) => void;
}) {
  return (
    <div className={`flex items-center gap-3 py-3.5 border-b border-gray-50 last:border-0 ${!item.in_stock ? 'opacity-50' : ''}`}>
      <VegDot isVeg={item.is_veg} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
          {!item.in_stock && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 text-[10px] font-semibold rounded-full whitespace-nowrap">
              OUT
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.code}</p>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
          {formatCurrency(item.price)}
        </p>

        {/* Stock toggle */}
        <button
          onClick={() => onToggleStock(item)}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            item.in_stock
              ? 'bg-green-50 text-green-600 active:bg-green-100'
              : 'bg-gray-100 text-gray-400 active:bg-gray-200'
          }`}
          title={item.in_stock ? 'Mark out of stock' : 'Mark in stock'}
        >
          {item.in_stock ? '✓' : '✗'}
        </button>

        {/* Edit */}
        <button
          onClick={() => onEdit(item)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600
                     active:bg-gray-200 transition-colors text-sm"
        >
          ✏️
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(item)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400
                     active:bg-red-100 transition-colors text-sm"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  items,
  onEditCategory,
  onDeleteCategory,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onToggleStock,
}: {
  category: Category;
  items: Item[];
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (cat: Category) => void;
  onAddItem: (categoryId: number) => void;
  onEditItem: (item: Item) => void;
  onDeleteItem: (item: Item) => void;
  onToggleStock: (item: Item) => void;
}) {
  return (
    <div className="mb-4">
      {/* Category header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-xl mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {category.name}
          </span>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddItem(category.id!)}
            className="text-xs text-brand-600 font-semibold px-2 py-1 rounded-lg active:bg-brand-50"
          >
            + Add
          </button>
          <button
            onClick={() => onEditCategory(category)}
            className="text-xs text-gray-400 px-2 py-1 rounded-lg active:bg-gray-100"
          >
            Edit
          </button>
          <button
            onClick={() => onDeleteCategory(category)}
            className="text-xs text-red-400 px-2 py-1 rounded-lg active:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4">
        {items.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400">No items in this category.</p>
            <button
              onClick={() => onAddItem(category.id!)}
              className="text-sm text-brand-600 font-medium mt-1"
            >
              Add first item →
            </button>
          </div>
        ) : (
          items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onEdit={onEditItem}
              onDelete={onDeleteItem}
              onToggleStock={onToggleStock}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Items screen ──────────────────────────────────────────────────────────────

export default function ItemsScreen() {
  const navigate = useNavigate();
  const {
    categories, items, loading, error,
    loadAll, deleteCategory, deleteItem, toggleStock,
  } = useItemsStore();

  const [search, setSearch]               = useState('');

  // Drawers
  const [catFormOpen, setCatFormOpen]     = useState(false);
  const [editingCat, setEditingCat]       = useState<Category | null>(null);
  const [itemFormOpen, setItemFormOpen]   = useState(false);
  const [editingItem, setEditingItem]     = useState<Item | null>(null);
  const [defaultCatId, setDefaultCatId]  = useState<number | undefined>();

  // Confirm dialogs
  const [deleteCatTarget, setDeleteCatTarget]   = useState<Category | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<Item | null>(null);
  const [deleteError, setDeleteError]           = useState('');

  useEffect(() => { loadAll(); }, []);

  // Search filter
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.code.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Group items by category
  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    filteredItems.forEach(item => {
      if (!map.has(item.category_id)) map.set(item.category_id, []);
      map.get(item.category_id)!.push(item);
    });
    return map;
  }, [filteredItems]);

  // Stats
  const totalItems   = items.length;
  const inStockCount = items.filter(it => it.in_stock).length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openAddCategory = () => { setEditingCat(null); setCatFormOpen(true); };
  const openEditCategory = (cat: Category) => { setEditingCat(cat); setCatFormOpen(true); };

  const openAddItem = (categoryId: number) => {
    setEditingItem(null);
    setDefaultCatId(categoryId);
    setItemFormOpen(true);
  };
  const openEditItem = (item: Item) => { setEditingItem(item); setItemFormOpen(true); };

  const handleDeleteCategory = async () => {
    if (!deleteCatTarget?.id) return;
    const result = await deleteCategory(deleteCatTarget.id);
    if (!result.ok) { setDeleteError(result.reason ?? 'Cannot delete.'); }
    setDeleteCatTarget(null);
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget?.id) return;
    await deleteItem(deleteItemTarget.id);
    setDeleteItemTarget(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* Header */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Menu Items</h1>
          <button
            onClick={openAddCategory}
            className="px-3 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded-xl
                       active:bg-brand-400 transition-colors border border-brand-400"
          >
            + Category
          </button>
        </div>
        <p className="text-brand-200 text-xs">
          {totalItems} items · {inStockCount} in stock · {categories.length} categories
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 sticky top-0 bg-gray-50 z-10 border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-gray-200 rounded-2xl text-sm
                       outline-none focus:border-brand-400 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-3">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-300">Loading…</div>

        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500">{error}</p>
          </div>

        ) : categories.length === 0 ? (
          /* Zero state — no categories at all */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <span className="text-5xl">🍽️</span>
            <p className="text-base font-semibold text-gray-700 text-center">
              No menu items yet.
            </p>
            <p className="text-sm text-gray-400 text-center">
              Start by adding a category, then add items inside it.
            </p>
            <button
              onClick={openAddCategory}
              className="px-6 py-3 bg-brand-600 text-white rounded-2xl font-semibold text-sm shadow-md
                         active:bg-brand-700"
            >
              Add First Category
            </button>
          </div>

        ) : search && filteredItems.length === 0 ? (
          /* Search no results */
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-gray-500">No items match "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm text-brand-600 font-medium">
              Clear search
            </button>
          </div>

        ) : (
          /* Category sections */
          categories.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              items={grouped.get(cat.id!) ?? []}
              onEditCategory={openEditCategory}
              onDeleteCategory={cat => setDeleteCatTarget(cat)}
              onAddItem={openAddItem}
              onEditItem={openEditItem}
              onDeleteItem={item => setDeleteItemTarget(item)}
              onToggleStock={item => toggleStock(item.id!, !item.in_stock)}
            />
          ))
        )}
      </div>

      {/* FAB: Add item (shown only when categories exist) */}
      {categories.length > 0 && !search && (
        <div className="fixed bottom-16 left-0 right-0 px-4 z-30 pointer-events-none">
          <button
            onClick={() => {
              setEditingItem(null);
              setDefaultCatId(categories[0]?.id);
              setItemFormOpen(true);
            }}
            className="w-full h-14 bg-brand-600 text-white rounded-2xl font-semibold text-base shadow-xl
                       flex items-center justify-center gap-2
                       active:bg-brand-700 active:scale-[0.98] transition-all
                       pointer-events-auto"
          >
            + Add Item
          </button>
        </div>
      )}

      {/* ── Drawers ─────────────────────────────────────────────────────────── */}

      <CategoryForm
        open={catFormOpen}
        editing={editingCat}
        onClose={() => setCatFormOpen(false)}
      />

      <ItemForm
        open={itemFormOpen}
        editing={editingItem}
        defaultCategoryId={defaultCatId}
        categories={categories}
        onClose={() => setItemFormOpen(false)}
      />

      {/* ── Confirm dialogs ─────────────────────────────────────────────────── */}

      {/* Delete category */}
      <ConfirmDialog
        open={!!deleteCatTarget}
        title="Delete Category?"
        message={`"${deleteCatTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        confirmDestructive
        onConfirm={handleDeleteCategory}
        onCancel={() => { setDeleteCatTarget(null); setDeleteError(''); }}
      />

      {/* Category delete blocked (has items) */}
      <ConfirmDialog
        open={!!deleteError}
        title="Cannot Delete"
        message={deleteError}
        confirmLabel="OK"
        confirmDestructive={false}
        onConfirm={() => setDeleteError('')}
        onCancel={() => setDeleteError('')}
      />

      {/* Delete item */}
      <ConfirmDialog
        open={!!deleteItemTarget}
        title="Delete Item?"
        message={`"${deleteItemTarget?.name}" will be permanently removed from the menu.`}
        confirmLabel="Delete"
        confirmDestructive
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteItemTarget(null)}
      />
    </div>
  );
}
