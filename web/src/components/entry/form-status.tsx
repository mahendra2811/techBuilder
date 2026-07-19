'use client';

import { Notice } from './states';

/**
 * The standard save-flow status pair every mutation form renders under its
 * fields: a red server-error Notice and a green saved Notice. Test ids follow
 * the repo-wide convention this extraction found everywhere:
 * `${testIdPrefix}-error` / `${testIdPrefix}-saved`. Forms with extra states
 * (photo-upload warning, temp-password reveal, "Enter another" button…) keep
 * rendering those alongside — this covers only the universal pair.
 */
export function FormStatus({
  error,
  saved,
  savedLabel,
  testIdPrefix,
}: {
  error: string | null;
  saved: boolean;
  savedLabel: string;
  testIdPrefix: string;
}) {
  return (
    <>
      {error && (
        <Notice tone="error" testId={`${testIdPrefix}-error`}>
          {error}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId={`${testIdPrefix}-saved`}>
          {savedLabel}
        </Notice>
      )}
    </>
  );
}
