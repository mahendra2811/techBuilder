'use client';

/**
 * Shared inline "closing remark" action for a RESOLVED damage issue — WO-11/WO-12 damage
 * lifecycle step 2. Extracted out of `driver-damage-screen.tsx` (SUPERVISOR restructure) so
 * both the driver's own damage screen and the new supervisor damage screen
 * (`supervisor-damage-screen.tsx`) can reuse the exact same action, next to the other shared
 * damage-lifecycle piece (`damage-timeline.tsx`).
 *
 * Backend rule (`backend/src/records/records.service.ts` `closeIssue`): only the issue's
 * CREATOR may close it (`row.createdBy === p.userId`), regardless of role — there is no
 * SM/Owner override. Callers MUST gate on `issue.createdBy === <current user id>` (in addition
 * to `status === 'RESOLVED' && !closingNote`) before rendering this component; it does not
 * re-check that itself.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CloseIssueInput, Issue } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { apiErrorOf } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Notice } from '@/components/entry/states';

export function CloseIssueInline({ issue, onClosed }: { issue: Issue; onClosed: () => void }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  const close = useMutation({
    mutationFn: (input: CloseIssueInput) => api<Issue>('POST', `/records/issue/${issue.id}/close`, input),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      onClosed();
    },
  });

  const serverError =
    apiErrorOf(m, close.error);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        data-testid={`close-issue-${issue.id}-open`}
        onClick={() => setOpen(true)}
      >
        {w.closeButton}
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-2.5" data-testid={`close-issue-${issue.id}`}>
      <Label htmlFor={`close-note-${issue.id}`}>{w.closeNoteLabel}</Label>
      <Textarea
        id={`close-note-${issue.id}`}
        data-testid={`close-note-${issue.id}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {serverError && (
        <Notice tone="error" testId={`close-issue-${issue.id}-error`}>
          {serverError}
        </Notice>
      )}
      <Button
        type="button"
        size="sm"
        className="w-fit"
        data-testid={`close-issue-${issue.id}-submit`}
        disabled={close.isPending}
        onClick={() => close.mutate({ closingNote: note.trim() ? note.trim() : undefined })}
      >
        {close.isPending ? w.closeSubmitting : w.closeSubmit}
      </Button>
    </div>
  );
}
