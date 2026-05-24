import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFromSupabase, restoreFromPayload, type BackupPayload } from '../services/backup';

type Stage = 'idle' | 'fetching' | 'restoring' | 'done' | 'error';

export default function PhoneSyncScreen() {
  const navigate = useNavigate();
  const [stage, setStage]       = useState<Stage>('idle');
  const [backup, setBackup]     = useState<BackupPayload | null>(null);
  const [error, setError]       = useState('');
  const [counts, setCounts]     = useState<Record<string, number>>({});

  // On mount — fetch backup info to show user what's available
  useEffect(() => {
    previewBackup();
  }, []);

  async function previewBackup() {
    setStage('fetching');
    setError('');
    try {
      const payload = await fetchFromSupabase();
      if (!payload) {
        setError('Supabase mein koi backup nahi mila. Pehle laptop pe backup chalao.');
        setStage('error');
        return;
      }
      setBackup(payload);
      setCounts({
        categories:    payload.categories?.length    ?? 0,
        items:         payload.items?.length         ?? 0,
        customers:     payload.customers?.length     ?? 0,
        invoices:      payload.invoices?.length      ?? 0,
      });
      setStage('idle');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError('Backup fetch fail: ' + msg);
      setStage('error');
    }
  }

  async function handleSync() {
    if (!backup) return;
    setStage('restoring');
    setError('');
    try {
      await restoreFromPayload(backup);
      setStage('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError('Restore fail: ' + msg);
      setStage('error');
    }
  }

  const backedUpAt = backup?.backed_up_at
    ? new Date(backup.backed_up_at).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-brand-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">
          🐢
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Phone Sync</h1>
        <p className="text-sm text-gray-400 mt-1">Supabase se is phone pe data copy karo</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-800">

        {/* Fetching state */}
        {stage === 'fetching' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-gray-300 text-sm">Backup check ho raha hai…</p>
          </div>
        )}

        {/* Restoring state */}
        {stage === 'restoring' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-gray-300 text-sm">Data is phone pe copy ho raha hai…</p>
            <p className="text-gray-500 text-xs text-center">Band mat karo</p>
          </div>
        )}

        {/* Done state */}
        {stage === 'done' && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center text-3xl">
              ✅
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">Sync Complete!</p>
              <p className="text-gray-400 text-sm mt-1">
                {counts.items} items, {counts.categories} categories restore ho gaye
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full mt-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              Login karo →
            </button>
          </div>
        )}

        {/* Error state */}
        {stage === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 text-sm leading-relaxed">{error}</p>
            </div>
            <button
              onClick={previewBackup}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              Dobara try karo
            </button>
          </div>
        )}

        {/* Idle — show backup info + sync button */}
        {stage === 'idle' && backup && (
          <div className="flex flex-col gap-5">

            {/* Backup details */}
            <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Last Backup
              </p>
              <p className="text-white font-medium text-sm">{backedUpAt}</p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { label: 'Items',      value: counts.items },
                  { label: 'Categories', value: counts.categories },
                  { label: 'Customers',  value: counts.customers },
                  { label: 'Invoices',   value: counts.invoices },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-900 rounded-lg px-3 py-2">
                    <p className="text-gray-400 text-xs">{label}</p>
                    <p className="text-white font-semibold text-lg leading-tight">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <p className="text-amber-400 text-xs leading-relaxed">
                ⚠️ Is phone ka existing data delete hokar Supabase wala data aa jaayega.
              </p>
            </div>

            {/* Sync button */}
            <button
              onClick={handleSync}
              className="w-full bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-semibold py-4 rounded-xl transition-all text-base shadow-lg"
            >
              Sync Karo
            </button>

            {/* Skip */}
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full text-gray-500 hover:text-gray-300 text-sm py-1 transition-colors"
            >
              Skip → seedha login karo
            </button>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-gray-600 text-xs text-center mt-8 max-w-xs">
        Sirf pehli baar ya naye phone pe use karo. Laptop pe sync already chal raha hai.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-10 h-10 border-4 border-gray-700 border-t-brand-500 rounded-full animate-spin" />
  );
}
