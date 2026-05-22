import { useState, useEffect } from 'react';
import Drawer from '../components/Drawer';
import { Input, SubmitButton } from '../components/FormFields';
import { useItemsStore } from '../stores/itemsStore';
import type { Category } from '../db';

interface CategoryFormProps {
  open: boolean;
  editing: Category | null;
  onClose: () => void;
}

export default function CategoryForm({ open, editing, onClose }: CategoryFormProps) {
  const { addCategory, updateCategory } = useItemsStore();

  const [name, setName]     = useState('');
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  // Populate when editing
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setError('');
    }
  }, [open, editing]);

  const validate = (): boolean => {
    if (!name.trim()) { setError('Category name is required.'); return false; }
    if (name.trim().length > 40) { setError('Max 40 characters.'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await updateCategory(editing.id, name);
      } else {
        await addCategory(name);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      title={editing ? 'Edit Category' : 'Add Category'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 mt-4">
        <Input
          label="Category Name"
          placeholder="e.g. Cold Beverages"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          error={error}
          maxLength={40}
          data-drawer-autofocus
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <SubmitButton
          label={editing ? 'Save Changes' : 'Add Category'}
          loading={saving}
          onClick={handleSave}
        />
      </div>
    </Drawer>
  );
}
