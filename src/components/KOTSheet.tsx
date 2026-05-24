// src/components/KOTSheet.tsx
//
// Kitchen Order Ticket — prints current cart items to kitchen.
// Uses browser print (no Bluetooth printer needed).
// Triggered from NewBill header via "KOT" button.

import { useState, useRef } from 'react';
import { CONFIG } from '../config';
import type { CartLine } from '../utils/billMath';

interface KOTSheetProps {
  open: boolean;
  lines: CartLine[];
  invoiceNumber: string;
  onClose: () => void;
}

export default function KOTSheet({ open, lines, invoiceNumber, onClose }: KOTSheetProps) {
  const [tableNumber, setTableNumber] = useState('');
  const [note, setNote]               = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const activeLines = lines.filter(l => l.qty > 0);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>KOT - ${invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
            width: 80mm;
            padding: 4mm;
            background: white;
          }
          .center   { text-align: center; }
          .bold     { font-weight: bold; }
          .large    { font-size: 18px; }
          .xl       { font-size: 22px; }
          .sep      { border-top: 2px dashed #000; margin: 6px 0; }
          .sep-thin { border-top: 1px dashed #000; margin: 4px 0; }
          .row      { display: flex; justify-content: space-between; align-items: flex-start; margin: 4px 0; }
          .row .name{ flex: 1; padding-right: 8px; }
          .row .qty { font-size: 16px; font-weight: bold; min-width: 30px; text-align: right; }
          .label    { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
          .table-box {
            border: 3px solid #000;
            padding: 4px 8px;
            display: inline-block;
            font-size: 20px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:11px; letter-spacing:2px;">KITCHEN ORDER TICKET</div>
        <div class="center" style="font-size:10px;">${CONFIG.SHOP_NAME}</div>
        <div class="sep"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div>
            <div class="label">Invoice</div>
            <div class="bold" style="font-size:12px;">${invoiceNumber}</div>
          </div>
          <div style="text-align:right;">
            <div class="label">Time</div>
            <div class="bold">${timeStr}</div>
            <div style="font-size:10px;">${dateStr}</div>
          </div>
        </div>

        ${tableNumber ? `
        <div style="text-align:center; margin: 6px 0;">
          <div class="label">Table</div>
          <div class="table-box">${tableNumber.toUpperCase()}</div>
        </div>
        ` : ''}

        <div class="sep"></div>

        <div class="row" style="margin-bottom:4px;">
          <span class="label bold" style="flex:1;">ITEM</span>
          <span class="label bold">QTY</span>
        </div>
        <div class="sep-thin"></div>

        ${activeLines.map(line => `
          <div class="row">
            <span class="name" style="font-size:14px;">${line.name}</span>
            <span class="qty">×${line.qty}</span>
          </div>
        `).join('')}

        ${note ? `
          <div class="sep-thin"></div>
          <div class="label">Note</div>
          <div style="font-size:12px; margin-top:2px;">${note}</div>
        ` : ''}

        <div class="sep"></div>
        <div class="center" style="font-size:10px; margin-top:4px;">
          ${activeLines.reduce((s, l) => s + l.qty, 0)} items total
        </div>
      </body>
      </html>
    `);

    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Kitchen Order Ticket</h2>
            <p className="text-xs text-gray-400 font-mono">{invoiceNumber}</p>
          </div>
          <span className="text-2xl">👨‍🍳</span>
        </div>

        {/* Table number input */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
            Table Number
          </label>
          <input
            type="text"
            placeholder="e.g. T1, T2, Counter..."
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm font-semibold
                       outline-none focus:border-brand-400 bg-gray-50"
          />
        </div>

        {/* Note */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
            Kitchen Note (optional)
          </label>
          <input
            type="text"
            placeholder="Less spicy, no onion..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm
                       outline-none focus:border-brand-400 bg-gray-50"
          />
        </div>

        {/* Items preview */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Items ({activeLines.reduce((s, l) => s + l.qty, 0)})
          </p>
          {activeLines.length === 0 ? (
            <p className="text-sm text-gray-400">No items in cart</p>
          ) : (
            <div className="space-y-1.5">
              {activeLines.map(line => (
                <div key={line.itemId} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-800">{line.name}</span>
                  <span className="text-sm font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
                    ×{line.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-13 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm active:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            disabled={activeLines.length === 0}
            className="flex-[2] h-13 bg-orange-500 text-white rounded-2xl font-bold text-base
                       active:bg-orange-600 shadow-md disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            🖨️ Print KOT
          </button>
        </div>
      </div>
    </div>
  );
}
