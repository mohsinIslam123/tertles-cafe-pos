import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrinterStore } from '../stores/printerStore';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { CONFIG } from '../config';
import { setSetting, getSetting } from '../db';
import { formatDateTime } from '../utils/format';
import {
  runManualBackup, exportJsonFile, restoreFromJsonFile,
  fetchFromSupabase, restoreFromPayload,
} from '../services/backup';
import ChangePinSheet from '../components/ChangePinSheet';
import ConfirmDialog from '../components/ConfirmDialog';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-4 mb-2">{title}</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 mx-4">
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value, onClick, destructive = false, disabled = false }: {
  icon: string; label: string; value?: string;
  onClick?: () => void; destructive?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled || !onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
        ${onClick && !disabled ? 'active:bg-gray-50' : ''} ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="text-xl flex-none">{icon}</span>
      <span className={`flex-1 text-sm font-medium ${destructive ? 'text-red-500' : 'text-gray-800'}`}>{label}</span>
      {value && <span className="text-xs text-gray-400 font-medium">{value}</span>}
      {onClick && !disabled && <span className="text-gray-300 text-sm">›</span>}
    </button>
  );
}

function PrinterSection() {
  const { status, deviceName, isSupported, pair, unpair } = usePrinterStore();
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const [copies, setCopies] = useState<1|2|3>(CONFIG.PRINT_COPIES);

  useEffect(() => {
    getSetting<number>('print_copies').then(v => { if (v) setCopies(v as 1|2|3); });
  }, []);

  const handlePair = async () => {
    setPairError(''); setPairing(true);
    const result = await pair();
    if (!result.ok && result.reason !== 'Pairing cancelled.') setPairError(result.reason ?? 'Failed.');
    setPairing(false);
  };

  const handleCopies = async (n: 1|2|3) => { setCopies(n); await setSetting('print_copies', n); };

  const isPaired = status !== 'unpaired';
  const statusColors: Record<string, string> = { unpaired: 'text-gray-400', idle: 'text-green-600', connecting: 'text-amber-500', printing: 'text-amber-500', error: 'text-red-500' };
  const statusLabels: Record<string, string> = { unpaired: 'Not paired', idle: 'Ready', connecting: 'Connecting…', printing: 'Printing…', error: 'Error' };

  if (!isSupported) {
    return (
      <Section title="Printer">
        <div className="px-4 py-4">
          <p className="text-sm text-amber-700 font-medium">⚠️ Web Bluetooth not available</p>
          <p className="text-xs text-gray-400 mt-1">Use Chrome on Android for Bluetooth printing.</p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Printer">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-xl">🖨️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">{deviceName ?? 'No printer paired'}</p>
          <p className={`text-xs font-medium mt-0.5 ${statusColors[status]}`}>{statusLabels[status]}</p>
        </div>
      </div>
      <Row icon="🔗" label={pairing ? 'Pairing…' : isPaired ? 'Pair Different Printer' : 'Pair Bluetooth Printer'} onClick={pairing ? undefined : handlePair} disabled={pairing} />
      {isPaired && <Row icon="🗑️" label="Forget Printer" onClick={unpair} destructive />}
      {pairError && <div className="px-4 py-3 bg-red-50"><p className="text-xs text-red-600 font-medium">{pairError}</p></div>}
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <p className="text-sm font-medium text-gray-800">Print Copies</p>
              <p className="text-xs text-gray-400">Per bill</p>
            </div>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
            {([1,2,3] as const).map(n => (
              <button key={n} onClick={() => handleCopies(n)}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${copies === n ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500'}`}
              >{n}</button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function BackupSection() {
  const { lastSyncAt, markSynced } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncOk, setSyncOk] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showCloudRestoreConfirm, setShowCloudRestoreConfirm] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const supabaseConfigured = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

  const handleManualSync = async () => {
    setSyncing(true); setSyncError(''); setSyncOk(false);
    try {
      await runManualBackup();
      await markSynced();
      setSyncOk(true);
      setTimeout(() => setSyncOk(false), 3000);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try { await exportJsonFile(); }
    catch (e) { alert('Export failed: ' + (e instanceof Error ? e.message : e)); }
    finally { setExporting(false); }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setShowRestoreConfirm(true);
    e.target.value = '';
  };

  const handleJsonRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true); setRestoreError(''); setShowRestoreConfirm(false);
    try {
      await restoreFromJsonFile(restoreFile);
      alert('Restore complete. The app will reload.');
      window.location.reload();
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setRestoring(false); setRestoreFile(null);
    }
  };

  const handleCloudRestore = async () => {
    setRestoring(true); setRestoreError(''); setShowCloudRestoreConfirm(false);
    try {
      const payload = await fetchFromSupabase();
      if (!payload) { setRestoreError('No cloud backup found for this shop.'); setRestoring(false); return; }
      await restoreFromPayload(payload);
      alert('Restore complete. The app will reload.');
      window.location.reload();
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed.');
      setRestoring(false);
    }
  };

  return (
    <Section title="Backup & Restore">
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">☁️</span>
            <div>
              <p className="text-sm font-medium text-gray-800">Cloud Backup</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {!supabaseConfigured
                  ? 'Not configured — fill SUPABASE_URL in config.ts'
                  : lastSyncAt ? `Last: ${formatDateTime(lastSyncAt)}` : 'Never synced'}
              </p>
            </div>
          </div>
          <button onClick={handleManualSync} disabled={syncing || !supabaseConfigured}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors
              ${syncOk ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700 active:bg-brand-100'}
              disabled:opacity-40`}
          >
            {syncing ? 'Syncing…' : syncOk ? 'Synced ✓' : 'Sync Now'}
          </button>
        </div>
        {syncError && <p className="text-xs text-red-500 mt-2 font-medium">{syncError}</p>}
      </div>

      <Row icon="📤" label={exporting ? 'Exporting…' : 'Export Data (JSON)'} value="Download backup file" onClick={handleExportJson} disabled={exporting} />

      <div>
        <Row icon="📥" label={restoring ? 'Restoring…' : 'Restore from JSON File'} value="Overwrites all data" onClick={() => fileRef.current?.click()} disabled={restoring} />
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelected} />
      </div>

      {supabaseConfigured && (
        <Row icon="☁️" label={restoring ? 'Restoring…' : 'Restore from Cloud'} value="Use latest cloud backup" onClick={() => setShowCloudRestoreConfirm(true)} disabled={restoring} />
      )}

      {restoreError && <div className="px-4 py-3 bg-red-50"><p className="text-xs text-red-600 font-medium">{restoreError}</p></div>}

      <ConfirmDialog open={showRestoreConfirm} title="Restore from file?"
        message={`"${restoreFile?.name}" will overwrite ALL current data. This cannot be undone.`}
        confirmLabel="Restore" confirmDestructive
        onConfirm={handleJsonRestore} onCancel={() => { setShowRestoreConfirm(false); setRestoreFile(null); }} />

      <ConfirmDialog open={showCloudRestoreConfirm} title="Restore from cloud?"
        message="This will overwrite ALL local data with the latest cloud backup. Cannot be undone."
        confirmLabel="Restore" confirmDestructive
        onConfirm={handleCloudRestore} onCancel={() => setShowCloudRestoreConfirm(false)} />
    </Section>
  );
}

export default function SettingsScreen() {
  const { logout }   = useAuthStore();
  const navigate     = useNavigate();
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="bg-brand-600 text-white px-5 pt-12 pb-5">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-brand-200 text-xs mt-0.5">{CONFIG.SHOP_NAME}</p>
      </div>

      <div className="pt-5">
        <Section title="Tools">
          <Row icon="🔍" label="Bill Search" onClick={() => navigate('/more/bill-search')} />
          <Row icon="📅" label="Day Close"   onClick={() => navigate('/more/day-close')} />
        </Section>

        <PrinterSection />

        <Section title="Shop Info">
          <Row icon="🏪" label="Shop Name"  value={CONFIG.SHOP_NAME} />
          <Row icon="📍" label="Address"    value={CONFIG.SHOP_ADDRESS.slice(0, 28) + (CONFIG.SHOP_ADDRESS.length > 28 ? '…' : '')} />
          <Row icon="📞" label="Phone"      value={CONFIG.SHOP_PHONE} />
          <Row icon="🧾" label="GSTIN"      value={CONFIG.GSTIN} />
          <div className="px-4 py-3 bg-gray-50 rounded-b-2xl">
            <p className="text-[11px] text-gray-400">Edit in <code className="font-mono bg-gray-100 px-1 rounded">src/config.ts</code> and redeploy.</p>
          </div>
        </Section>

        <Section title="Tax & Billing">
          <Row icon="💰" label="GST Rate"       value={`${CONFIG.GST_RATE}%`} />
          <Row icon="📊" label="GST Mode"       value={CONFIG.GST_MODE} />
          <Row icon="🍽️" label="Service Charge" value={CONFIG.SERVICE_CHARGE_PERCENT > 0 ? `${CONFIG.SERVICE_CHARGE_PERCENT}%` : 'Disabled'} />
        </Section>

        <Section title="Security">
          <Row icon="🔐" label="Change PIN" onClick={() => setPinOpen(true)} />
        </Section>

        <BackupSection />

        <Section title="About">
          <Row icon="ℹ️" label="App Version" value="1.0.0 · Phase 8" />
          <Row icon="🔒" label="Lock App" onClick={logout} destructive />
        </Section>
      </div>

      <ChangePinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  );
}
