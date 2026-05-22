import { forwardRef } from 'react';

// ── Text / Number input ───────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        ref={ref}
        className={`
          w-full h-12 px-4 rounded-2xl border text-sm font-medium
          transition-colors outline-none
          ${error
            ? 'border-red-300 bg-red-50 focus:border-red-400'
            : 'border-gray-200 bg-white focus:border-brand-500'
          }
          ${className}
        `}
        {...props}
      />
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';

// ── Toggle ────────────────────────────────────────────────────────────────────

interface ToggleProps {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  activeColor?: string;
}

export function Toggle({ label, sub, checked, onChange, activeColor = 'bg-brand-600' }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-3 text-left focus:outline-none"
    >
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-none
          ${checked ? activeColor : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow
            transition-transform duration-200
            ${checked ? 'translate-x-6' : 'translate-x-0'}`}
        />
      </div>
    </button>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  label: string;
  value: string | number;
  options: SelectOption[];
  error?: string;
  onChange: (val: string) => void;
}

export function Select({ label, value, options, error, onChange }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`
          w-full h-12 px-4 rounded-2xl border text-sm font-medium bg-white
          appearance-none outline-none transition-colors
          ${error
            ? 'border-red-300 bg-red-50'
            : 'border-gray-200 focus:border-brand-500'
          }
        `}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────

interface SubmitButtonProps {
  label: string;
  loading?: boolean;
  onClick: () => void;
}

export function SubmitButton({ label, loading, onClick }: SubmitButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full h-14 bg-brand-600 text-white rounded-2xl font-semibold text-base
                 active:bg-brand-700 transition-all active:scale-[0.98]
                 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-md"
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}
