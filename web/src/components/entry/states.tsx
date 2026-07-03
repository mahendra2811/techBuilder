'use client';

/** Tiny shared loading / empty / error / notice states for the field-entry screens. */
import { Loader2 } from 'lucide-react';
import type { ErrorCode } from '@techbuilder/contracts';
import { ApiClientError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LoadingState({ label }: { label?: string }) {
  const m = useMessages();
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" data-testid="loading-state">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label ?? m.ENTRY_UI.loading}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground" data-testid="empty-state">
      {label}
    </p>
  );
}

/** Maps unknown/query errors through the message catalog; optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const m = useMessages();
  const code: ErrorCode | undefined = error instanceof ApiClientError ? error.code : undefined;
  return (
    <div className="flex flex-col items-start gap-2 py-4" role="alert" data-testid="error-state">
      <p className="text-sm text-destructive">{apiErrorMessage(m, code)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {m.ENTRY_UI.retry}
        </Button>
      )}
    </div>
  );
}

/** Inline notice line (success = green, warning = amber, error = destructive). */
export function Notice({
  tone,
  children,
  testId,
}: {
  tone: 'success' | 'warning' | 'error';
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={cn(
        'rounded-lg px-3 py-2 text-sm',
        tone === 'success' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        tone === 'error' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </p>
  );
}
