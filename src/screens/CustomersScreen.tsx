import { useState, useEffect, useMemo } from 'react';
import { db, type Customer } from '../db';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import CustomerDetailSheet from '../components/CustomerDetailSheet';

function CustomerRow({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50
                 border-b border-gray-50 last:border-0"
    >
      {/* Avatar initials */}
      <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-none">
        <span className="text-sm font-bold text-brand-700">
          {customer.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{customer.name}</p>
        <p className="text-xs text-gray-400 font-mono">{customer.phone}</p>
      </div>

      <div className="text-right flex-none">
        <p className="text-sm font-bold text-gray-900">{formatCurrency(customer.total_spent)}</p>
        <p className="text-xs text-gray-400">
          {customer.last_visit ? formatRelativeDate(new Date(customer.last_visit)) : 'Never'}
        </p>
      </div>
    </button>
  );
}

export default function CustomersScreen() {
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Customer | null>(null);

  useEffect(() => {
    db.customers
      .orderBy('last_visit')
      .reverse()
      .toArray()
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  // Refresh list when detail sheet closes (customer may have new bills)
  const handleDetailClose = () => {
    setSelected(null);
    db.customers.orderBy('last_visit').reverse().toArray().then(setCustomers);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [customers, search]);

  const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-5">
        <h1 className="text-xl font-bold">Customers</h1>
        <p className="text-brand-200 text-xs mt-0.5">
          {customers.length} customers · {formatCurrency(totalSpent)} total
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 sticky top-0 bg-gray-50 z-10 border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-9 bg-white border border-gray-200 rounded-2xl text-sm
                       outline-none focus:border-brand-400 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
            >×</button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="px-4 pt-3">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-300">Loading…</div>

        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-5xl">👥</span>
            <p className="text-base font-semibold text-gray-700">No customers yet.</p>
            <p className="text-sm text-gray-400 text-center px-6">
              Customers are added during billing when you attach a name and phone number to a bill.
            </p>
          </div>

        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-gray-500">No customers match "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm text-brand-600 font-medium">
              Clear search
            </button>
          </div>

        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            {filtered.map(c => (
              <CustomerRow
                key={c.id}
                customer={c}
                onClick={() => setSelected(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <CustomerDetailSheet
        customer={selected}
        onClose={handleDetailClose}
      />
    </div>
  );
}
