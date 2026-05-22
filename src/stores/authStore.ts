import { create } from 'zustand';
import bcrypt from 'bcryptjs';
import { getSetting, setSetting } from '../db';
import { CONFIG } from '../config';

const SALT_ROUNDS = 10;

interface AuthState {
  // ── Runtime state ──────────────────────────────────────────────────────────
  isAuthenticated: boolean;
  isFirstLaunch: boolean;     // true = no PIN set yet
  loading: boolean;           // true while checking IndexedDB on mount
  attempts: number;
  lockedUntil: number | null; // epoch ms, null = not locked

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Check IndexedDB on app start to determine first-launch vs normal flow. */
  init: () => Promise<void>;

  /** First-launch only: hash and store PIN. */
  setupPin: (pin: string) => Promise<void>;

  /** Normal login. Returns error message string or null on success. */
  login: (pin: string) => Promise<string | null>;

  /** Sign out without clearing PIN. */
  logout: () => void;

  /** Replace stored PIN hash. Called after secret-code reset flow completes. */
  resetPin: (newPin: string) => Promise<void>;

  /** How many ms remain on the lockout. 0 = not locked. */
  lockMsRemaining: () => number;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isFirstLaunch: false,
  loading: true,
  attempts: 0,
  lockedUntil: null,

  init: async () => {
    try {
      // Restore attempt/lock state persisted across refreshes
      const lockData = await getSetting<{ attempts: number; lockedUntil: number | null }>(
        'pin_lock',
      );
      const pinHash = await getSetting<string>('pin_hash');

      set({
        isFirstLaunch: !pinHash,
        loading: false,
        attempts: lockData?.attempts ?? 0,
        lockedUntil: lockData?.lockedUntil ?? null,
      });
    } catch {
      // IndexedDB unavailable (private mode, storage error)
      set({ loading: false, isFirstLaunch: true });
    }
  },

  setupPin: async (pin: string) => {
    const hash = await bcrypt.hash(pin, SALT_ROUNDS);
    await setSetting('pin_hash', hash);
    await setSetting('pin_lock', { attempts: 0, lockedUntil: null });
    set({ isFirstLaunch: false, isAuthenticated: true, attempts: 0, lockedUntil: null });
  },

  login: async (pin: string): Promise<string | null> => {
    const { lockedUntil } = get();

    // Check if still locked
    if (lockedUntil && Date.now() < lockedUntil) {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      return `Locked. Try again in ${secs}s`;
    }

    const hash = await getSetting<string>('pin_hash');
    if (!hash) return 'No PIN set. Restart the app.';

    const match = await bcrypt.compare(pin, hash);

    if (match) {
      // Clear lockout on success
      await setSetting('pin_lock', { attempts: 0, lockedUntil: null });
      set({ isAuthenticated: true, attempts: 0, lockedUntil: null });
      return null;
    }

    // Wrong PIN
    const newAttempts = get().attempts + 1;
    let newLockedUntil: number | null = null;

    if (newAttempts >= CONFIG.PIN_MAX_ATTEMPTS) {
      newLockedUntil = Date.now() + CONFIG.PIN_LOCK_DURATION_MS;
    }

    await setSetting('pin_lock', { attempts: newAttempts, lockedUntil: newLockedUntil });
    set({ attempts: newAttempts, lockedUntil: newLockedUntil });

    if (newLockedUntil) {
      return `Too many attempts. Locked for 5 minutes.`;
    }

    const remaining = CONFIG.PIN_MAX_ATTEMPTS - newAttempts;
    return `Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`;
  },

  logout: () => set({ isAuthenticated: false }),

  resetPin: async (newPin: string) => {
    const hash = await bcrypt.hash(newPin, SALT_ROUNDS);
    await setSetting('pin_hash', hash);
    await setSetting('pin_lock', { attempts: 0, lockedUntil: null });
    set({ isAuthenticated: false, attempts: 0, lockedUntil: null });
  },

  lockMsRemaining: () => {
    const { lockedUntil } = get();
    if (!lockedUntil) return 0;
    return Math.max(0, lockedUntil - Date.now());
  },
}));
