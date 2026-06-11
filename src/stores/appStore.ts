import { create } from 'zustand';
import { getSetting, setSetting } from '../db';

interface AppState {
  isOnline: boolean;
  lastSyncAt: Date | null;
  loading: boolean;
  gstEnabled: boolean;

  init: () => Promise<void>;
  setOnline: (online: boolean) => void;
  markSynced: () => Promise<void>;
  setGstEnabled: (enabled: boolean) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: navigator.onLine,
  lastSyncAt: null,
  loading: true,
  gstEnabled: true,

  init: async () => {
    const ts  = await getSetting<string>('last_sync_at');
    const gst = await getSetting<boolean>('gst_enabled');
    set({
      isOnline: navigator.onLine,
      lastSyncAt: ts ? new Date(ts) : null,
      gstEnabled: gst ?? true,
      loading: false,
    });
  },

  setOnline: (online: boolean) => set({ isOnline: online }),

  markSynced: async () => {
    const now = new Date();
    await setSetting('last_sync_at', now.toISOString());
    set({ lastSyncAt: now });
  },

  setGstEnabled: async (enabled: boolean) => {
    await setSetting('gst_enabled', enabled);
    set({ gstEnabled: enabled });
  },
}));
