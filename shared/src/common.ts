/**
 * Common primitives & conventions — FROZEN.
 * Pin verbatim: UUIDv7 IDs · integer paise money · UTC timestamps · Asia/Kolkata business day.
 */

/** Client-generated UUIDv7 (time-ordered). NEVER serial/auto-increment. Generate with `uuidv7()`. */
export type UUID = string;

/** Money is ALWAYS integer paise. Never float. 100 paise = ₹1. Format only at the display edge. */
export type Paise = number;

/** Business day as `YYYY-MM-DD` in Asia/Kolkata (NOT a timestamp). Used for all "today" logic. */
export type BusinessDate = string;

/** UTC instant as ISO-8601 string (e.g. "2026-06-30T14:05:00.000Z"). DB column is `timestamptz`. */
export type Timestamp = string;

/** Fixed app timezone for computing the business day from a UTC instant. */
export const APP_TIMEZONE = 'Asia/Kolkata' as const;

/** Audit fields present on every business row (server-managed). */
export interface AuditFields {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: UUID;
  updatedBy: UUID;
  /** Soft-delete marker. Every read filters `deletedAt IS NULL`. */
  deletedAt: Timestamp | null;
  /** Monotonic version for last-write-wins conflict resolution. */
  version: number;
}

/** Cursor pagination — request. */
export interface PageQuery {
  limit?: number; // default 50, max 200
  cursor?: string | null;
}

/** Cursor pagination — response envelope meta. */
export interface PageMeta {
  nextCursor: string | null;
  total?: number;
}

/** A window selector for dashboards / reports / exports. */
export interface DateWindow {
  from: BusinessDate;
  to: BusinessDate;
}
