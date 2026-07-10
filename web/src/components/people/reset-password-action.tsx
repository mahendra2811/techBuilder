'use client';

/** WO-9 (wave 2) — admin password reset button, shared by the people list row
 * action and the person-profile header (WO-10). Generates a fresh temp
 * password client-side (same helper the create-user form uses — the backend
 * just hashes whatever is sent) and reveals it once on success, exactly like
 * a newly created login's temp password. Scope (Owner any / SM own-created
 * roles / never TEAM_HEAD / never yourself) is enforced by the caller via
 * whether this component is rendered at all, and re-enforced server-side. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { UUID } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { makeTempPassword } from '@/lib/cascade';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/entry/states';

export function ResetPasswordAction({ userId, testIdPrefix = 'reset-password' }: { userId: UUID; testIdPrefix?: string }) {
  const m = useMessages();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (tempPassword: string) =>
      api<{ ok: true }>('POST', `/users/${userId}/reset-password`, { newPassword: tempPassword }),
    onSuccess: (_ok, tempPassword) => {
      setConfirming(false);
      setResult(tempPassword);
    },
    onError: () => setResult(null),
  });

  const serverError =
    mutation.error instanceof ApiClientError ? apiErrorMessage(m, mutation.error.code) : mutation.error ? apiErrorMessage(m) : null;

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant={confirming ? 'default' : 'outline'}
        data-testid={`${testIdPrefix}-button`}
        disabled={mutation.isPending}
        onClick={() => {
          if (confirming) {
            setResult(null);
            mutation.mutate(makeTempPassword());
          } else {
            setConfirming(true);
          }
        }}
      >
        {mutation.isPending ? m.PEOPLE_UI.resettingPassword : confirming ? m.PEOPLE_UI.resetPasswordConfirm : m.PEOPLE_UI.resetPassword}
      </Button>
      {serverError && (
        <Notice tone="error" testId={`${testIdPrefix}-error`}>
          {serverError}
        </Notice>
      )}
      {result && (
        <Notice tone="success" testId={`${testIdPrefix}-result`}>
          {m.PEOPLE_UI.tempPasswordLabel}: <strong data-testid={`${testIdPrefix}-value`}>{result}</strong>
          <br />
          {m.PEOPLE_UI.tempPasswordHint}
        </Notice>
      )}
    </div>
  );
}
