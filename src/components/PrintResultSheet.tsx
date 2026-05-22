import { useEffect } from 'react';
import type { PrinterStatus } from '../services/printer';

interface PrintResultSheetProps {
  open: boolean;
  status: PrinterStatus;
  lastError: string | null;
  copies: number;
  onRetry: () => void;
  onPdfFallback: () => void;
  onClose: () => void;
}

export default function PrintResultSheet({
  open,
  status,
  lastError,
  copies,
  onRetry,
  onPdfFallback,
  onClose,
}: PrintResultSheetProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const isPrinting = status === 'printing' || status === 'connecting';
  const isError    = status === 'error';
  const isSuccess  = status === 'idle' && !lastError;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={isError || isSuccess ? onClose : undefined} />
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* Printing / connecting */}
        {isPrinting && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 bg-brand-50 rounded-full flex items-center justify-center">
              <span className="text-3xl animate-spin">⚙️</span>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">
                {status === 'connecting' ? 'Connecting to printer…' : 'Printing…'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {copies > 1 ? `Printing ${copies} copies` : 'Sending to printer'}
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {isSuccess && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center text-3xl">
              🖨️
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">Printed!</p>
              <p className="text-sm text-gray-400 mt-1">
                {copies} cop{copies !== 1 ? 'ies' : 'y'} sent to printer
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full h-12 bg-brand-600 text-white rounded-2xl font-semibold active:bg-brand-700"
            >
              Done
            </button>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-2xl flex-none">
                ❌
              </div>
              <div>
                <p className="text-base font-bold text-gray-900">Print Failed</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  {lastError ?? 'Could not connect to printer.'}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-2xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">
                Make sure the printer is on and within Bluetooth range.
              </p>
            </div>

            <button
              onClick={onRetry}
              className="w-full h-12 bg-brand-600 text-white rounded-2xl font-semibold text-sm
                         active:bg-brand-700 flex items-center justify-center gap-2"
            >
              🔄 Retry Print
            </button>
            <button
              onClick={onPdfFallback}
              className="w-full h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm
                         active:bg-gray-200 flex items-center justify-center gap-2"
            >
              🖥️ Print via Browser (PDF)
            </button>
            <button
              onClick={onClose}
              className="text-sm text-gray-400 text-center py-1"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
