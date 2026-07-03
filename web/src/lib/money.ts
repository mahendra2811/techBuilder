/**
 * Money edge-formatting. FROZEN convention: money is INTEGER PAISE everywhere;
 * rupees exist only at the display/input edge.
 */
import type { Paise } from '@techbuilder/contracts';

/** UI rupees (may be fractional, e.g. 250.50) → integer paise. Never float paise. */
export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** Integer paise → display string, e.g. 25000 → "₹250", 25050 → "₹250.50". */
export function formatPaise(paise: Paise): string {
  const rupees = paise / 100;
  const hasFraction = paise % 100 !== 0;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
