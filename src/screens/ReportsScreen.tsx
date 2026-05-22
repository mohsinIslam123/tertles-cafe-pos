import { useState, useMemo } from 'react';
import { getCurrentFYStart } from '../config';
import { todayStart, todayEnd, weekStart } from '../utils/format';
import SalesTab    from '../reports/SalesTab';
import ItemsTab    from '../reports/ItemsTab';
import CustomersTab from '../reports/CustomersTab';
import PaymentTab  from '../reports/PaymentTab';
import GSTTab      from '../reports/GSTTab';
import DayCloseTab from '../reports/DayCloseTab';

// ─────────────────────────────────────────────────────────────────────────────

type Tab     = 'sales' | 'items' | 'customers' | 'payment' | 'gst' | 'dayclose';
type Preset  = 'today' | 'yesterday' | 'week' | 'month' | 'fy' | 'custom';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sales',     label: 'Sales',     icon: '📈' },
  { id: 'items',     label: 'Items',     icon: '🍽️' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'payment',   label: 'Payment',   icon: '💰' },
  { id: 'gst',       label: 'GST',       icon: '🧾' },
  { id: 'dayclose',  label: 'Day Close', icon: '📅' },
];

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today',     label: 'Today'     },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week',      label: 'Week'      },
  { id: 'month',     label: 'Month'     },
  { id: 'fy',        label: 'This FY'   },
  { id: 'custom',    label: 'Custom'    },
];

function yesterday(): { start: Date; end: Date } {
  const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

function monthStart(): Date {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}

function fyEnd(fyStart: Date): Date {
  const e = new Date(fyStart);
  e.setFullYear(e.getFullYear() + 1);
  e.setDate(e.getDate() - 1);
  e.setHours(23, 59, 59, 999);
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const [activeTab, setActiveTab]   = useState<Tab>('sales');
  const [preset, setPreset]         = useState<Preset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  // Compute date range from preset
  const { start, end, rangeLabel } = useMemo(() => {
    switch (preset) {
      case 'today':
        return { start: todayStart(), end: todayEnd(), rangeLabel: 'Today' };
      case 'yesterday': {
        const y = yesterday();
        return { start: y.start, end: y.end, rangeLabel: 'Yesterday' };
      }
      case 'week':
        return { start: weekStart(), end: todayEnd(), rangeLabel: 'This Week' };
      case 'month':
        return { start: monthStart(), end: todayEnd(), rangeLabel: 'This Month' };
      case 'fy': {
        const fyS = getCurrentFYStart();
        return { start: fyS, end: fyEnd(fyS), rangeLabel: 'This Financial Year' };
      }
      case 'custom': {
        const s = customStart ? new Date(customStart + 'T00:00:00') : todayStart();
        const e = customEnd   ? new Date(customEnd + 'T23:59:59')  : todayEnd();
        return { start: s, end: e, rangeLabel: `${customStart || '?'} to ${customEnd || '?'}` };
      }
    }
  }, [preset, customStart, customEnd]);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* Header */}
      <div className="bg-brand-600 text-white px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold">Reports</h1>
        <p className="text-brand-200 text-xs mt-0.5">{rangeLabel}</p>
      </div>

      {/* Tab chips */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                          whitespace-nowrap flex-none transition-all
                ${activeTab === tab.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date range presets */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-none transition-all
                ${preset === p.id
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === 'custom' && (
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-1">From</p>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-1">To</p>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs outline-none focus:border-brand-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="px-4 pt-4">
        {activeTab === 'sales'     && <SalesTab     start={start} end={end} rangeLabel={rangeLabel} />}
        {activeTab === 'items'     && <ItemsTab     start={start} end={end} rangeLabel={rangeLabel} />}
        {activeTab === 'customers' && <CustomersTab start={start} end={end} rangeLabel={rangeLabel} />}
        {activeTab === 'payment'   && <PaymentTab   start={start} end={end} rangeLabel={rangeLabel} />}
        {activeTab === 'gst'       && <GSTTab       start={start} end={end} rangeLabel={rangeLabel} />}
        {activeTab === 'dayclose'  && <DayCloseTab  start={start} end={end} rangeLabel={rangeLabel} />}
      </div>
    </div>
  );
}
