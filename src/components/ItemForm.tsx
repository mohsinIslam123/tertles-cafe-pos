import { useState, useEffect } from 'react';
import Drawer from '../components/Drawer';
import { Input, Toggle, Select, SubmitButton } from '../components/FormFields';
import { useItemsStore } from '../stores/itemsStore';
import type { Item, Category } from '../db';

interface ItemFormProps {
  open: boolean;
  editing: Item | null;
  defaultCategoryId?: number;
  categories: Category[];
  onClose: () => void;
}

interface FormErrors {
  name?: string;
  code?: string;
  price?: string;
  category?: string;
  global?: string;
}

const EMPTY_FORM = {
  name: '',
  code: '',
  price: '',
  category_id: '',
  is_veg: true,
  in_stock: true,
};

export default function ItemForm({
  open,
  editing,
  defaultCategoryId,
  categories,
  onClose,
}: ItemFormProps) {
  const { addItem, updateItem } = useItemsStore();

  const [form, setForm]       = useState(EMPTY_FORM);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [saving, setSaving]   = useState(false);

  // Populate on open
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name:        editing.name,
        code:        editing.code,
        price:       String(editing.price),
        category_id: String(editing.category_id),
        is_veg:      editing.is_veg,
        in_stock:    editing.in_stock,
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        category_id: defaultCategoryId ? String(defaultCategoryId) : (categories[0]?.id ? String(categories[0].id) : ''),
      });
    }
    setErrors({});
  }, [open, editing, defaultCategoryId, categories]);

  const set = (key: keyof typeof form, val: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setErrors(prev => ({ ...prev, [key]: undefined, global: undefined }));
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.name.trim())              e.name     = 'Item name is required.';
    else if (form.name.trim().length > 60) e.name  = 'Max 60 characters.';
    if (!form.code.trim())              e.code     = 'Item code is required.';
    else if (!/^[A-Za-z0-9]{1,8}$/.test(form.code.trim())) e.code = 'Code: 1–8 letters/numbers only.';
    const priceNum = parseFloat(form.price);
    if (!form.price || isNaN(priceNum) || priceNum <= 0) e.price = 'Enter a valid price.';
    else if (priceNum > 99999) e.price = 'Price too high.';
    if (!form.category_id) e.category = 'Select a category.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Omit<Item, 'id'> = {
        name:        form.name.trim(),
        code:        form.code.trim().toUpperCase(),
        price:       parseFloat(parseFloat(form.price).toFixed(2)),
        category_id: parseInt(form.category_id, 10),
        is_veg:      form.is_veg as boolean,
        in_stock:    form.in_stock as boolean,
      };

      if (editing?.id) {
        const result = await updateItem(editing.id, payload);
        if (!result.ok) { setErrors({ global: result.reason }); return; }
      } else {
        const result = await addItem(payload);
        if (!result.ok) { setErrors({ global: result.reason }); return; }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = categories.map(c => ({ value: String(c.id!), label: c.name }));

  return (
    <Drawer
      open={open}
      title={editing ? 'Edit Item' : 'Add Item'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 mt-4">
        {/* Global error (e.g. duplicate code) */}
        {errors.global && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-600 font-medium">{errors.global}</p>
          </div>
        )}

        <Input
          label="Item Name"
          placeholder="e.g. Masala Chai"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          error={errors.name}
          maxLength={60}
          data-drawer-autofocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Item Code"
            placeholder="e.g. MC01"
            value={form.code}
            onChange={e => set('code', e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
            error={errors.code}
            maxLength={8}
            hint="Unique shortcut for quick add"
          />
          <Input
            label="Price (₹)"
            placeholder="0.00"
            value={form.price}
            onChange={e => set('price', e.target.value.replace(/[^0-9.]/g, ''))}
            error={errors.price}
            inputMode="decimal"
            type="text"
          />
        </div>

        <Select
          label="Category"
          value={form.category_id}
          options={
            categoryOptions.length > 0
              ? categoryOptions
              : [{ value: '', label: '— Add a category first —' }]
          }
          error={errors.category}
          onChange={val => set('category_id', val)}
        />

        <div className="border border-gray-100 rounded-2xl px-4 divide-y divide-gray-50">
          <Toggle
            label="Vegetarian"
            sub={form.is_veg as boolean ? '🟢 Veg' : '🔴 Non-Veg'}
            checked={form.is_veg as boolean}
            onChange={val => set('is_veg', val)}
            activeColor="bg-green-500"
          />
          <Toggle
            label="Available"
            sub={(form.in_stock as boolean) ? 'In stock' : 'Out of stock'}
            checked={form.in_stock as boolean}
            onChange={val => set('in_stock', val)}
          />
        </div>

        <SubmitButton
          label={editing ? 'Save Changes' : 'Add Item'}
          loading={saving}
          onClick={handleSave}
        />
      </div>
    </Drawer>
  );
}
