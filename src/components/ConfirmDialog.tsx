import { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;        // NEW: custom cancel label
  confirmDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',     // default stays "Cancel"
  confirmDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl
                   animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{message}</p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm
                       active:bg-gray-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-12 rounded-2xl font-semibold text-sm transition-colors
              ${confirmDestructive
                ? 'bg-red-500 text-white active:bg-red-600'
                : 'bg-brand-600 text-white active:bg-brand-700'
              }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
