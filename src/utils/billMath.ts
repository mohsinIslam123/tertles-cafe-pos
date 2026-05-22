// ─────────────────────────────────────────────────────────────────────────────
// Pure bill calculation engine.
// No imports from React, DB, or config — fully testable in isolation.
// Apply steps in exact order per spec.
// ─────────────────────────────────────────────────────────────────────────────

export interface CartLine {
  itemId: number;
  name: string;       // snapshot at time of billing
  price: number;      // snapshot
  qty: number;
  itemDiscount: number; // flat rupee discount on this line
}

export interface BillTotals {
  subtotal: number;           // step 1: sum(qty * price)
  itemDiscountTotal: number;  // step 2: sum of item discounts
  afterItemDiscount: number;  // step 3: subtotal - itemDiscountTotal
  billDiscountAmount: number; // step 4: computed from type+value
  taxableAmount: number;      // step 5: afterItemDiscount - billDiscountAmount
  serviceChargeAmount: number;// step 6: percent on taxableAmount
  taxableForGST: number;      // step 7: taxableAmount + serviceChargeAmount
  cgst: number;               // step 8a
  sgst: number;               // step 8b
  preRoundTotal: number;      // step 8c: taxableForGST + cgst + sgst
  roundOff: number;           // step 9: nearest rupee - preRoundTotal (can be negative)
  total: number;              // step 10: rounded final
}

export function computeBill(
  lines: CartLine[],
  billDiscountType: 'percent' | 'flat' | null,
  billDiscountValue: number,
  serviceChargeEnabled: boolean,
  serviceChargePercent: number,
  gstRate: number,
  gstMode: 'exclusive' | 'inclusive',
): BillTotals {
  // Step 1
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.qty, 0));

  // Step 2
  const itemDiscountTotal = round2(lines.reduce((sum, l) => sum + l.itemDiscount, 0));

  // Step 3
  const afterItemDiscount = round2(subtotal - itemDiscountTotal);

  // Step 4 — bill discount on afterItemDiscount
  let billDiscountAmount = 0;
  if (billDiscountType === 'flat') {
    billDiscountAmount = round2(Math.min(billDiscountValue, afterItemDiscount));
  } else if (billDiscountType === 'percent') {
    billDiscountAmount = round2((afterItemDiscount * billDiscountValue) / 100);
  }

  // Step 5
  const taxableAmount = round2(afterItemDiscount - billDiscountAmount);

  // Step 6
  const serviceChargeAmount = serviceChargeEnabled
    ? round2((taxableAmount * serviceChargePercent) / 100)
    : 0;

  // Step 7
  const taxableForGST = round2(taxableAmount + serviceChargeAmount);

  // Step 8
  let cgst = 0;
  let sgst = 0;
  let preRoundTotal = 0;

  if (gstMode === 'exclusive') {
    cgst = round2((taxableForGST * (gstRate / 2)) / 100);
    sgst = round2((taxableForGST * (gstRate / 2)) / 100);
    preRoundTotal = round2(taxableForGST + cgst + sgst);
  } else {
    // inclusive: GST already inside taxableForGST
    // Extract: taxable_ex = taxableForGST / (1 + gstRate/100)
    const taxableExGST = round2(taxableForGST / (1 + gstRate / 100));
    cgst = round2((taxableExGST * (gstRate / 2)) / 100);
    sgst = round2((taxableExGST * (gstRate / 2)) / 100);
    preRoundTotal = taxableForGST; // total doesn't change in inclusive mode
  }

  // Step 9 — round to nearest rupee
  const rounded = Math.round(preRoundTotal);
  const roundOff = round2(rounded - preRoundTotal);

  // Step 10
  const total = rounded;

  return {
    subtotal,
    itemDiscountTotal,
    afterItemDiscount,
    billDiscountAmount,
    taxableAmount,
    serviceChargeAmount,
    taxableForGST,
    cgst,
    sgst,
    preRoundTotal,
    roundOff,
    total,
  };
}

/** Compute line total for a single cart line */
export function lineTotal(line: CartLine): number {
  return round2(line.price * line.qty - line.itemDiscount);
}

/** Round to 2 decimal places (avoids floating point drift) */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
