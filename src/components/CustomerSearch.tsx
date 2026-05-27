import { useState, useCallback } from 'react';
import { db, type Customer } from '../db';
import { useCartStore } from '../stores/cartStore';

interface CustomerSearchProps {
  onDone: () => void;
}

export default function CustomerSearch({ onDone }: CustomerSearchProps) {
  const { customerId, customerName, customerPhone, setCustomer } = useCartStore();

  const [query, setQuery]         = useState(customerPhone || '');
  const [results, setResults]     = useState<Customer[]>([]);
  const [showAdd, setShowAdd]     = useState(false);
  const [newName, setNewName]     = useState('');
  const [newPhone, setNewPhone]   = useState('');
  const [addError, setAddError]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [searched, setSearched]   = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setSearched(false);
    if (q.trim().length < 2) { setResults([]); return; }

    const lower = ((q) ?? "").toLowerCase();
    const byPhone = await db.customers.where('phone').startsWithIgnoreCase(q).limit(5).toArray();
    const byName  = await db.customers.filter(c => ((c.name) ?? "").toLowerCase().includes(lower)).limit(5).toArray();

    // Merge + dedupe
    const seen = new Set<number>();
    const merged: Customer[] = [];
    for (const c of [...byPhone, ...byName]) {
      if (!seen.has(c.id!)) { seen.add(c.id!); merged.push(c); }
    }
    setResults(merged.slice(0, 6));
    setSearched(true);
  }, []);

  const selectCustomer = (c: Customer) => {
    setCustomer(c.id!, c.name, c.phone);
    onDone();
  };

  const clearCustomer = () => {
    setCustomer(null, '', '');
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const handleAddNew = async () => {
    const name  = newName.trim();
    const phone = newPhone.trim();
    if (!name) { setAddError('Name is required.'); return; }
    if (!/^\d{10}$/.test(phone)) { setAddError('Phone must be 10 digits.'); return; }

    // Check duplicate phone
    const existing = await db.customers.where('phone').equals(phone).first();
    if (existing) { setAddError(`${phone} already linked to "${existing.name}".`); return; }

    setSaving(true);
    try {
      const id = await db.customers.add({ name, phone, total_spent: 0, last_visit: null }) as number;
      setCustomer(id, name, phone);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  // Already selected
  if (customerId) {
    return (
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{customerName}</p>
          <p className="text-xs text-gray-400">{customerPhone}</p>
        </div>
        <button
          onClick={clearCustomer}
          className="text-xs text-red-400 font-medium px-3 py-1.5 bg-red-50 rounded-xl active:bg-red-100"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          inputMode="tel"
          placeholder="Search phone or name…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          className="w-full h-11 pl-4 pr-10 border border-gray-200 rounded-2xl text-sm outline-none
                     focus:border-brand-500 transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
          >×</button>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => selectCustomer(c)}
              className="w-full flex items-center justify-between px-4 py-3 text-left
                         border-b border-gray-50 last:border-0 active:bg-gray-50"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone}</p>
              </div>
              <span className="text-brand-600 text-sm">→</span>
            </button>
          ))}
        </div>
      )}

      {/* No results + add option */}
      {searched && results.length === 0 && !showAdd && (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400">No customer found.</p>
          <button
            onClick={() => {
              setShowAdd(true);
              // Pre-fill phone if query looks like a number
              if (/^\d+$/.test(query)) setNewPhone(query);
            }}
            className="text-sm text-brand-600 font-medium mt-1"
          >
            + Add new customer
          </button>
        </div>
      )}

      {/* Skip / add new buttons when idle */}
      {!searched && !showAdd && (
        <div className="flex gap-2">
          <button
            onClick={onDone}
            className="flex-1 h-10 text-sm text-gray-500 bg-gray-100 rounded-xl active:bg-gray-200"
          >
            Skip
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex-1 h-10 text-sm text-brand-600 bg-brand-50 rounded-xl active:bg-brand-100 font-medium"
          >
            + Add new
          </button>
        </div>
      )}

      {/* Inline add form */}
      {showAdd && (
        <div className="border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700">New Customer</p>
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            className="h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-500"
          />
          <input
            type="text"
            inputMode="tel"
            placeholder="Phone (10 digits)"
            value={newPhone}
            maxLength={10}
            onChange={e => { setNewPhone(e.target.value.replace(/\D/g, '')); setAddError(''); }}
            className="h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-500"
          />
          {addError && <p className="text-xs text-red-500 font-medium">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setAddError(''); }}
              className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm active:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNew}
              disabled={saving}
              className="flex-1 h-10 bg-brand-600 text-white rounded-xl text-sm font-semibold
                         active:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
