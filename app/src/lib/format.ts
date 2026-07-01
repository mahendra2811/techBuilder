/** Display formatting at the edge. Money stored as integer paise → ₹ here. */
export const rupees = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** Window helper: last N days through today (business dates, local). */
export function lastNDays(n: number): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (n - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
