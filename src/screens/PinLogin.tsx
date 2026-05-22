import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { CONFIG } from '../config';
import { formatCountdown } from '../utils/format';

// ── PIN digit display ─────────────────────────────────────────────────────────

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex gap-5 justify-center my-8">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
            i < filled
              ? 'bg-brand-600 border-brand-600 scale-110'
              : 'bg-transparent border-gray-300'
          }`}
        />
      ))}
    </div>
  );
}

// ── Number pad ────────────────────────────────────────────────────────────────

function NumPad({
  onDigit,
  onBackspace,
  onSubmit,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {keys.map((key, idx) => {
        if (key === '') {
          return <div key={idx} />;
        }

        const isBackspace = key === '⌫';

        return (
          <button
            key={idx}
            disabled={disabled}
            onClick={() => {
              if (isBackspace) onBackspace();
              else onDigit(key);
            }}
            className={`
              h-16 rounded-2xl text-xl font-semibold
              transition-all duration-100 active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isBackspace
                ? 'text-gray-500 bg-gray-100 active:bg-gray-200'
                : 'text-gray-900 bg-white shadow-sm border border-gray-100 active:bg-gray-50'
              }
            `}
          >
            {key}
          </button>
        );
      })}

      {/* Full-width confirm button below the pad */}
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="col-span-3 mt-2 h-14 bg-brand-600 text-white rounded-2xl text-base font-semibold
                   active:bg-brand-700 transition-all duration-100 active:scale-[0.98]
                   disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
      >
        Confirm
      </button>
    </div>
  );
}

// ── Main PinLogin component ───────────────────────────────────────────────────

type Mode = 'login' | 'setup_new' | 'setup_confirm' | 'reset_secret' | 'reset_new' | 'reset_confirm';

export default function PinLogin() {
  const { isFirstLaunch, login, setupPin, resetPin, lockedUntil, attempts } = useAuthStore();

  const [mode, setMode] = useState<Mode>(isFirstLaunch ? 'setup_new' : 'login');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');  // stores first entry during setup confirm
  const [secretCode, setSecretCode] = useState('');
  const [error, setError] = useState('');
  const [lockRemaining, setLockRemaining] = useState(0);
  const [logoTaps, setLogoTaps] = useState(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lockout countdown
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, lockedUntil - Date.now());
      setLockRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedUntil ? Date.now() < lockedUntil : false;

  // Reset PIN accumulator whenever mode changes
  useEffect(() => {
    setPin('');
    setError('');
  }, [mode]);

  const handleDigit = useCallback((d: string) => {
    if (mode === 'reset_secret') {
      // Secret code is a separate field, no length limit enforced here
      setSecretCode(prev => prev.length < 8 ? prev + d : prev);
      return;
    }
    setPin(prev => prev.length < 4 ? prev + d : prev);
  }, [mode]);

  const handleBackspace = useCallback(() => {
    if (mode === 'reset_secret') {
      setSecretCode(prev => prev.slice(0, -1));
      return;
    }
    setPin(prev => prev.slice(0, -1));
  }, [mode]);

  const handleSubmit = useCallback(async () => {
    setError('');

    switch (mode) {
      case 'login': {
        if (pin.length < 4) { setError('Enter all 4 digits'); return; }
        const err = await login(pin);
        if (err) { setError(err); setPin(''); }
        break;
      }

      case 'setup_new': {
        if (pin.length < 4) { setError('PIN must be 4 digits'); return; }
        setFirstPin(pin);
        setPin('');
        setMode('setup_confirm');
        break;
      }

      case 'setup_confirm': {
        if (pin !== firstPin) {
          setError('PINs do not match. Start over.');
          setFirstPin('');
          setPin('');
          setMode('setup_new');
          return;
        }
        await setupPin(pin);
        break;
      }

      case 'reset_secret': {
        if (secretCode !== CONFIG.PIN_RESET_SECRET) {
          setError('Wrong code.');
          setSecretCode('');
          return;
        }
        setSecretCode('');
        setPin('');
        setMode('reset_new');
        break;
      }

      case 'reset_new': {
        if (pin.length < 4) { setError('PIN must be 4 digits'); return; }
        setFirstPin(pin);
        setPin('');
        setMode('reset_confirm');
        break;
      }

      case 'reset_confirm': {
        if (pin !== firstPin) {
          setError('PINs do not match. Try again.');
          setFirstPin('');
          setPin('');
          setMode('reset_new');
          return;
        }
        await resetPin(pin);
        setMode('login');
        break;
      }
    }
  }, [mode, pin, firstPin, secretCode, login, setupPin, resetPin]);

  // Long-press logo: 5 taps within 3 seconds triggers reset flow
  const handleLogoPress = () => {
    const newCount = logoTaps + 1;
    setLogoTaps(newCount);

    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);

    if (newCount >= 5) {
      setLogoTaps(0);
      setMode('reset_secret');
      return;
    }

    logoTapTimer.current = setTimeout(() => setLogoTaps(0), 3000);
  };

  // ── Labels per mode ────────────────────────────────────────────────────────

  const titles: Record<Mode, string> = {
    login:          'Enter PIN',
    setup_new:      'Set a PIN',
    setup_confirm:  'Confirm PIN',
    reset_secret:   'Enter reset code',
    reset_new:      'New PIN',
    reset_confirm:  'Confirm new PIN',
  };

  const subtitles: Record<Mode, string> = {
    login:          'Enter your 4-digit PIN to continue',
    setup_new:      'Choose a 4-digit PIN for this device',
    setup_confirm:  'Enter the same PIN again',
    reset_secret:   'Enter the secret code to proceed',
    reset_new:      'Choose a new 4-digit PIN',
    reset_confirm:  'Enter the new PIN again to confirm',
  };

  const isSecretMode = mode === 'reset_secret';
  const currentLength = isSecretMode ? secretCode.length : pin.length;
  // For the dots: secret mode shows progress up to 4 dots
  const dotsLength = isSecretMode ? 4 : 4;
  const dotsFilled = isSecretMode ? Math.min(secretCode.length, 4) : pin.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-between px-6 py-10">

      {/* Top section */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">

        {/* Logo / shop name — long-press to trigger reset */}
        <button
          onClick={handleLogoPress}
          className="flex flex-col items-center gap-3 mb-8 select-none focus:outline-none"
        >
          {/* Turtle icon (emoji for now — replace with SVG logo in Phase 8) */}
          <div
            className="w-20 h-20 bg-brand-600 rounded-3xl flex items-center justify-center text-4xl shadow-lg
                       transition-transform duration-75 active:scale-90"
          >
            🐢
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900">The Turtles Cafe</p>
            <p className="text-xs text-gray-400 mt-0.5">POS</p>
          </div>
        </button>

        {/* Reset tap progress indicator (subtle) */}
        {logoTaps > 0 && logoTaps < 5 && (
          <p className="text-xs text-gray-300 -mt-4 mb-6">
            {5 - logoTaps} more tap{5 - logoTaps !== 1 ? 's' : ''} for reset
          </p>
        )}

        {/* Mode title */}
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          {titles[mode]}
        </h1>
        <p className="text-sm text-gray-500 text-center mt-1">
          {subtitles[mode]}
        </p>

        {/* Lockout state */}
        {isLocked && (
          <div className="mt-4 px-5 py-3 bg-red-50 border border-red-200 rounded-2xl text-center">
            <p className="text-sm font-semibold text-red-700">Too many wrong attempts</p>
            <p className="text-3xl font-mono font-bold text-red-600 mt-1">
              {formatCountdown(lockRemaining)}
            </p>
            <p className="text-xs text-red-500 mt-1">Please wait before trying again</p>
          </div>
        )}

        {/* Attempt counter warning */}
        {!isLocked && attempts > 0 && mode === 'login' && (
          <p className="mt-3 text-xs text-amber-600 font-medium">
            {CONFIG.PIN_MAX_ATTEMPTS - attempts} attempt{CONFIG.PIN_MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} left before lockout
          </p>
        )}

        {/* PIN dots */}
        {!isLocked && <PinDots length={dotsLength} filled={dotsFilled} />}

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500 font-medium text-center -mt-2 mb-4 px-4">
            {error}
          </p>
        )}

        {/* Numpad */}
        {!isLocked && (
          <NumPad
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onSubmit={handleSubmit}
            disabled={
              isSecretMode
                ? secretCode.length === 0
                : pin.length < 4
            }
          />
        )}

        {/* Cancel reset flow */}
        {(mode === 'reset_secret' || mode === 'reset_new' || mode === 'reset_confirm') && (
          <button
            onClick={() => { setMode('login'); setSecretCode(''); setPin(''); setError(''); }}
            className="mt-5 text-sm text-gray-400 underline underline-offset-2"
          >
            Cancel reset
          </button>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-300 text-center">
        The Turtles Cafe · POS v1.0
      </p>
    </div>
  );
}
