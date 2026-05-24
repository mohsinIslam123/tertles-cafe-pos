import { useEffect, useState } from 'react';
import { fetchFromSupabase, restoreFromPayload, type BackupPayload } from '../services/backup';

type Stage = 'idle' | 'fetching' | 'restoring' | 'done' | 'error';

export default function PhoneSyncScreen() {
  const [stage, setStage]   = useState<Stage>('idle');
  const [backup, setBackup] = useState<BackupPayload | null>(null);
  const [error, setError]   = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => { previewBackup(); }, []);

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
        items:      payload.items?.length      ?? 0,
        categories: payload.categories?.length ?? 0,
        customers:  payload.customers?.length  ?? 0,
        invoices:   payload.invoices?.length   ?? 0,
      });
      setStage('idle');
    } catch (e: unknown) {
      setError('Fetch fail: ' + (e instanceof Error ? e.message : String(e)));
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
      setError('Restore fail: ' + (e instanceof Error ? e.message : String(e)));
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
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-brand-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4">🐢</div>
        <h1 className="text-2xl font-bold text-white">Phone Sync</h1>
        <p className="text-sm text-gray-400 mt-1">Supabase se is phone pe data copy karo</p>
      </div>

      <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 border border-gray-800">

        {stage === 'fetching' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-gray-300 text-sm">Backup check ho raha hai…</p>
          </div>
        )}

        {stage === 'restoring' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-gray-300 text-sm">Data copy ho raha hai… band mat karo</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center text-3xl">✅</div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">Sync Complete!</p>
              <p className="text-gray-400 text-sm mt-1">{counts.items} items restore ho gaye</p>
            </div>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="w-full mt-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-4 rounded-xl text-base"
            >
              App Kholein →
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button onClick={previewBackup} className="w-full bg-gray-800 text-white font-semibold py-3 rounded-xl text-sm">
              Dobara try karo
            </button>
          </div>
        )}

        {stage === 'idle' && backup && (
          <div className="flex flex-col gap-5">
            <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Last Backup</p>
              <p className="text-white font-medium text-sm">{backedUpAt}</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Object.entries(counts).map(([label, value]) => (
                  <div key={label} className="bg-gray-900 rounded-lg px-3 py-2">
                    <p className="text-gray-400 text-xs capitalize">{label}</p>
                    <p className="text-white font-semibold text-lg">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <p className="text-amber-400 text-xs">⚠️ Purana data delete hokar Supabase wala aa jaayega.</p>
            </div>
            <button onClick={handleSync} className="w-full bg-brand-600 text-white font-semibold py-4 rounded-xl text-base">
              Sync Karo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-10 h-10 border-4 border-gray-700 border-t-brand-500 rounded-full animate-spin" />;
}
