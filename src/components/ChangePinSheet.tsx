import { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { getSetting } from '../db';
import { useAuthStore } from '../stores/authStore';

interface ChangePinSheetProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'verify' | 'new' | 'confirm';

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-5 justify-center my-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150
          ${i < filled ? 'bg-brand-600 border-brand-600 scale-110' : 'bg-transparent border-gray-300'}`}
        />
      ))}
    </div>
  );
}

function NumPad({ onDigit, onBack, onConfirm, disabled }: {
  onDigit: (d: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {keys.map((k, i) => {
        if (!k) return <div key={i} />;
        const isBack = k === '⌫';
        return (
          <button key={i} disabled={disabled}
            onClick={() => isBack ? onBack() : onDigit(k)}
            className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95
              disabled:opacity-40
              ${isBack ? 'text-gray-500 bg-gray-100' : 'text-gray-900 bg-white shadow-sm border border-gray-100'}`}
          >{k}</button>
        );
      })}
      <button onClick={onConfirm} disabled={disabled}
        className="col-span-3 mt-1 h-12 bg-brand-600 text-white rounded-2xl font-semibold
                   active:bg-brand-700 transition-all active:scale-[0.98] disabled:opacity-40"
      >Confirm</button>
    </div>
  );
}

export default function ChangePinSheet({ open, onClose }: ChangePinSheetProps) {
  const { resetPin } = useAuthStore();
  const [step, setStep]       = useState<Step>('verify');
  const [pin, setPin]         = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setStep('verify'); setPin(''); setFirstPin(''); setError(''); }
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => { setPin(''); setError(''); }, [step]);

  const handleDigit = (d: string) => setPin(p => p.length < 4 ? p + d : p);
  const handleBack  = () => setPin(p => p.slice(0, -1));

  const handleConfirm = async () => {
    if (pin.length < 4) { setError('Enter all 4 digits.'); return; }
    setLoading(true);
    setError('');

    try {
      if (step === 'verify') {
        const hash = await getSetting<string>('pin_hash');
        if (!hash) { setError('No PIN set.'); return; }
        const match = await bcrypt.compare(pin, hash);
        if (!match) { setError('Wrong PIN.'); setPin(''); return; }
        setStep('new');

      } else if (step === 'new') {
        setFirstPin(pin);
        setStep('confirm');

      } else {
        if (pin !== firstPin) {
          setError('PINs do not match. Try again.');
          setFirstPin('');
          setStep('new');
          return;
        }
        await resetPin(pin);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const titles: Record<Step, string> = {
    verify:  'Enter current PIN',
    new:     'Enter new PIN',
    confirm: 'Confirm new PIN',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-4 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 text-center">Change PIN</h2>
        <p className="text-sm text-gray-500 text-center mt-1">{titles[step]}</p>
        <PinDots filled={pin.length} />
        {error && <p className="text-xs text-red-500 font-medium text-center -mt-2 mb-3">{error}</p>}
        <NumPad onDigit={handleDigit} onBack={handleBack} onConfirm={handleConfirm} disabled={loading} />
        <button onClick={onClose} className="w-full mt-4 text-sm text-gray-400 text-center">Cancel</button>
      </div>
    </div>
  );
}
