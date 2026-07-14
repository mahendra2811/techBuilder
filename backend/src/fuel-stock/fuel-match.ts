/**
 * Round 2 (C7) — the diesel double-check, PURE logic (unit-tested like wage-calc).
 *
 * The supervisor ISSUES diesel to a vehicle; that vehicle's driver logs it RECEIVED
 * (fuel_logs). Both sides match on (vehicle, business date): equal litres → CONFIRMED
 * (one event, never double-counted); unequal → MISMATCH 🚩. A side alone stays PENDING
 * while its business day is open; once the day closes it flags as a missing-side 🚩.
 * Exact-litres match (client default — Q6; tolerance would slot in here if ever granted).
 */
import type { MaterialTxnStatus } from '@techbuilder/contracts';

/** Verdict for a paired issuance/receipt. Exact litres (floating input — compare on 2dp). */
export function matchVerdict(issuedLitres: number, receivedLitres: number): MaterialTxnStatus {
  return Math.abs(issuedLitres - receivedLitres) < 0.005 ? 'CONFIRMED' : 'MISMATCH';
}

export interface DaySide {
  id: string;
  litres: number;
  status: MaterialTxnStatus;
  matchedId: string | null;
}

export interface FlagRow {
  vehicleId: string;
  siteId: string;
  businessDate: string;
  issuedLitres: number | null;
  receivedLitres: number | null;
  status: MaterialTxnStatus;
  issuanceId: string | null;
  fuelLogId: string | null;
}

/**
 * Derive the red-flag rows for one (vehicle, businessDate) bucket.
 * `dayClosed` = the business day is over (EOD cutoff passed) — a lone side then flags.
 * CONFIRMED pairs produce NO row (quiet). MISMATCH pairs and closed-day lone sides do.
 */
export function deriveDayFlags(
  vehicleId: string,
  siteId: string,
  businessDate: string,
  issuances: DaySide[],
  receipts: DaySide[],
  dayClosed: boolean,
): FlagRow[] {
  const out: FlagRow[] = [];
  const receiptsById = new Map(receipts.map((r) => [r.id, r]));
  const pairedReceiptIds = new Set<string>();

  for (const iss of issuances) {
    const paired = iss.matchedId ? receiptsById.get(iss.matchedId) : undefined;
    if (paired) {
      pairedReceiptIds.add(paired.id);
      if (iss.status === 'MISMATCH') {
        out.push({
          vehicleId, siteId, businessDate,
          issuedLitres: iss.litres, receivedLitres: paired.litres,
          status: 'MISMATCH', issuanceId: iss.id, fuelLogId: paired.id,
        });
      }
      continue; // CONFIRMED pair — quiet
    }
    // lone issuance
    if (dayClosed) {
      out.push({
        vehicleId, siteId, businessDate,
        issuedLitres: iss.litres, receivedLitres: null,
        status: 'MISMATCH', issuanceId: iss.id, fuelLogId: null,
      });
    }
  }
  for (const rec of receipts) {
    if (pairedReceiptIds.has(rec.id)) continue;
    if (rec.matchedId) continue; // paired with an issuance outside this bucket slice — treated by its pair
    if (dayClosed) {
      out.push({
        vehicleId, siteId, businessDate,
        issuedLitres: null, receivedLitres: rec.litres,
        status: 'MISMATCH', issuanceId: null, fuelLogId: rec.id,
      });
    }
  }
  return out;
}
