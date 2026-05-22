import { create } from 'zustand';
import { getSetting, setSetting } from '../db';

interface AppState {
  isOnline: boolean;
  lastSyncAt: Date | null;
  loading: boolean;

  init: () => Promise<void>;
  setOnline: (online: boolean) => void;
  markSynced: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: navigator.onLine,
  lastSyncAt: null,
  loading: true,

  init: async () => {
    const ts = await getSetting<string>('last_sync_at');
    set({
      isOnline: navigator.onLine,
      lastSyncAt: ts ? new Date(ts) : null,
      loading: false,
    });
  },

  setOnline: (online: boolean) => set({ isOnline: online }),

  markSynced: async () => {
    const now = new Date();
    await setSetting('last_sync_at', now.toISOString());
    set({ lastSyncAt: now });
  },
}));
