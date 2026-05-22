import { create } from 'zustand';
import { db, type Category, type Item } from '../db';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemWithCategory extends Item {
  category_name: string;
}

interface ItemsState {
  categories: Category[];
  items: Item[];
  loading: boolean;
  error: string | null;

  // Load
  loadAll: () => Promise<void>;

  // Category actions
  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: number, name: string) => Promise<void>;
  deleteCategory: (id: number) => Promise<{ ok: boolean; reason?: string }>;
  reorderCategories: (ids: number[]) => Promise<void>;

  // Item actions
  addItem: (item: Omit<Item, 'id'>) => Promise<{ ok: boolean; reason?: string }>;
  updateItem: (id: number, item: Omit<Item, 'id'>) => Promise<{ ok: boolean; reason?: string }>;
  deleteItem: (id: number) => Promise<void>;
  toggleStock: (id: number, inStock: boolean) => Promise<void>;

  clearError: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useItemsStore = create<ItemsState>((set, get) => ({
  categories: [],
  items: [],
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [categories, items] = await Promise.all([
        db.categories.orderBy('sort_order').toArray(),
        db.items.orderBy('name').toArray(),
      ]);
      set({ categories, items });
    } catch (e) {
      set({ error: 'Failed to load data. Restart the app.' });
    } finally {
      set({ loading: false });
    }
  },

  // ── Categories ──────────────────────────────────────────────────────────────

  addCategory: async (name: string) => {
    const trimmed = name.trim();
    const { categories } = get();
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1);
    await db.categories.add({ name: trimmed, sort_order: maxOrder + 1 });
    await get().loadAll();
  },

  updateCategory: async (id: number, name: string) => {
    await db.categories.update(id, { name: name.trim() });
    await get().loadAll();
  },

  deleteCategory: async (id: number) => {
    // Block delete if category has items
    const count = await db.items.where('category_id').equals(id).count();
    if (count > 0) {
      return {
        ok: false,
        reason: `This category has ${count} item${count > 1 ? 's' : ''}. Move or delete them first.`,
      };
    }
    await db.categories.delete(id);
    await get().loadAll();
    return { ok: true };
  },

  reorderCategories: async (ids: number[]) => {
    await db.transaction('rw', db.categories, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.categories.update(ids[i], { sort_order: i });
      }
    });
    await get().loadAll();
  },

  // ── Items ───────────────────────────────────────────────────────────────────

  addItem: async (item: Omit<Item, 'id'>) => {
    // Check unique code
    const existing = await db.items.where('code').equals(item.code.trim().toUpperCase()).first();
    if (existing) {
      return { ok: false, reason: `Code "${item.code.toUpperCase()}" already used by "${existing.name}".` };
    }
    await db.items.add({ ...item, code: item.code.trim().toUpperCase() });
    await get().loadAll();
    return { ok: true };
  },

  updateItem: async (id: number, item: Omit<Item, 'id'>) => {
    // Check unique code — exclude self
    const existing = await db.items.where('code').equals(item.code.trim().toUpperCase()).first();
    if (existing && existing.id !== id) {
      return { ok: false, reason: `Code "${item.code.toUpperCase()}" already used by "${existing.name}".` };
    }
    await db.items.update(id, { ...item, code: item.code.trim().toUpperCase() });
    await get().loadAll();
    return { ok: true };
  },

  deleteItem: async (id: number) => {
    await db.items.delete(id);
    await get().loadAll();
  },

  toggleStock: async (id: number, inStock: boolean) => {
    await db.items.update(id, { in_stock: inStock });
    // Optimistic update — no full reload needed for this
    set(state => ({
      items: state.items.map(it => it.id === id ? { ...it, in_stock: inStock } : it),
    }));
  },

  clearError: () => set({ error: null }),
}));
