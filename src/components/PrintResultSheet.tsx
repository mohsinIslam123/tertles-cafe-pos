import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  // ── Drag state (desktop only) ──────────────────────────────────────────────
  const dialogRef  = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0, elX: 0, elY: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Reset position when opened
  useEffect(() => {
    if (open) setPos(null);
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Mouse drag handlers ────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dialogRef.current) return;
    isDragging.current = true;
    const rect = dialogRef.current.getBoundingClientRect();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      elX: rect.left,
      elY: rect.top,
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !dialogRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPos({
      x: dragStart.current.elX + dx,
      y: dragStart.current.elY + dy,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ── New Bill action ────────────────────────────────────────────────────────
  const handleNewBill = () => {
    onClose();
    navigate('/bill', { replace: true });
  };

  if (!open) return null;

  const isPrinting = status === 'printing' || status === 'connecting';
  const isError    = status === 'error';
  const isSuccess  = status === 'idle' && !lastError;

  // ── Dialog style: bottom sheet on mobile, centered+draggable on desktop ────
  const desktopStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none', cursor: 'grab' }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!isPrinting ? onClose : undefined}
      />

      {/* Dialog card */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-sm bg-white shadow-2xl
                   rounded-t-3xl md:rounded-3xl
                   px-5 pt-4 pb-6
                   md:pb-6 mx-auto"
        style={typeof window !== 'undefined' && window.innerWidth >= 768 ? desktopStyle : {}}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — acts as drag zone on desktop */}
        <div
          className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 md:cursor-grab"
          onMouseDown={handleMouseDown}
          title="Drag to move"
        />

        {/* ── Printing / connecting ────────────────────────────────────────── */}
        {isPrinting && (
          <div className="flex flex-col items-center gap-4 py-2">
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
            <p className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-full">
              ✓ Bill already saved
            </p>
            {/* Cancel while printing */}
            <button onClick={onClose} className="text-sm text-gray-400 py-1">
              Skip printing
            </button>
          </div>
        )}

        {/* ── Success ──────────────────────────────────────────────────────── */}
        {isSuccess && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center text-3xl">
              🖨️
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">Printed!</p>
              <p className="text-sm text-gray-400 mt-1">
                {copies} cop{copies !== 1 ? 'ies' : 'y'} sent to printer
              </p>
            </div>
            <p className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-full">
              ✓ Bill saved to system
            </p>
            <div className="w-full flex flex-col gap-2 mt-1">
              <button
                onClick={onClose}
                className="w-full h-12 bg-brand-600 text-white rounded-2xl font-semibold active:bg-brand-700"
              >
                Done
              </button>
              <button
                onClick={handleNewBill}
                className="w-full h-12 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm active:bg-gray-200"
              >
                + New Bill
              </button>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {isError && (
          <div className="flex flex-col gap-3">
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

            <p className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-full text-center">
              ✓ Bill is saved — printing is optional
            </p>

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
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-11 bg-gray-50 text-gray-500 rounded-2xl font-semibold text-sm
                           active:bg-gray-100 border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleNewBill}
                className="flex-1 h-11 bg-brand-50 text-brand-700 rounded-2xl font-semibold text-sm
                           active:bg-brand-100 border border-brand-200"
              >
                + New Bill
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
