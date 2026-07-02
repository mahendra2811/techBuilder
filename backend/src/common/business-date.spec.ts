import { describe, expect, it } from 'vitest';
import { addDays, businessDateNow, daysBetween, kolkataClock } from './business-date';

// IST = UTC+5:30. 2026-07-02T16:00:00Z = 2026-07-02 21:30 IST.

describe('kolkataClock', () => {
  it('converts a UTC instant to the Kolkata local date + minutes', () => {
    const { date, minutes } = kolkataClock(new Date('2026-07-02T16:00:00Z'));
    expect(date).toBe('2026-07-02');
    expect(minutes).toBe(21 * 60 + 30);
  });

  it('rolls to the next local date after IST midnight', () => {
    // 18:35Z = 00:05 IST on the NEXT calendar day
    const { date, minutes } = kolkataClock(new Date('2026-07-02T18:35:00Z'));
    expect(date).toBe('2026-07-03');
    expect(minutes).toBe(5);
  });
});

describe('businessDateNow (org EOD cutoff — punchlist WP-5 decision: after cutoff → NEXT business date)', () => {
  it('an entry at 21:30 IST with cutoff 20:00 belongs to the NEXT business date', () => {
    expect(businessDateNow(new Date('2026-07-02T16:00:00Z'), '20:00')).toBe('2026-07-03');
  });

  it('an entry at 19:59 IST with cutoff 20:00 belongs to the SAME business date', () => {
    expect(businessDateNow(new Date('2026-07-02T14:29:00Z'), '20:00')).toBe('2026-07-02');
  });

  it('exactly at the cutoff belongs to the next business date (>= cutoff)', () => {
    expect(businessDateNow(new Date('2026-07-02T14:30:00Z'), '20:00')).toBe('2026-07-03');
  });

  it('just after IST midnight, before cutoff, belongs to the new local date', () => {
    expect(businessDateNow(new Date('2026-07-02T18:35:00Z'), '20:00')).toBe('2026-07-03');
  });

  it('respects a non-default cutoff', () => {
    expect(businessDateNow(new Date('2026-07-02T13:31:00Z'), '19:00')).toBe('2026-07-03'); // 19:01 IST
    expect(businessDateNow(new Date('2026-07-02T13:29:00Z'), '19:00')).toBe('2026-07-02'); // 18:59 IST
  });
});

describe('addDays / daysBetween', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween is positive when `to` is later, negative when earlier', () => {
    expect(daysBetween('2026-07-01', '2026-07-03')).toBe(2);
    expect(daysBetween('2026-07-03', '2026-07-01')).toBe(-2);
    expect(daysBetween('2026-07-02', '2026-07-02')).toBe(0);
  });
});
