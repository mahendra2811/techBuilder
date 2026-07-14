'use client';

/**
 * CW-10 complaint box — inbox side (SITE_MANAGER + OWNER; one component, two
 * thin route wrappers, same shape as approvals-screen.tsx).
 *
 * Visibility is entirely server-enforced (ComplaintsService.list):
 *   - SITE_MANAGER: only target=SITE_MANAGER complaints on his own site(s).
 *   - OWNER: every complaint, including target=OWNER ones — those are marked
 *     "private to Owner" here as a reminder, but the privacy itself is the
 *     backend never sending an OWNER-target row to a Site Manager's GET
 *     /complaints call. This screen adds no extra filtering on top.
 *
 * Raiser names: resolved client-side against the same scoped GET /users list
 * the approvals-screen uses (a raiser outside that scope falls back to an
 * "unknown" label — same documented approach, not a bug).
 *
 * Photos: no media-read endpoint exists yet (R2 keys absent — see progress-
 * screen.tsx's identical note), so this shows an attachment COUNT, not
 * thumbnails.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import type { Complaint, IssueStatus, User, UUID } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { formatKolkataDateTime } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type InboxRole = 'SITE_MANAGER' | 'OWNER';
type Filter = IssueStatus | 'ALL';

const UI = {
  en: {
    title: 'Complaints',
    subtitle: 'Complaints raised by your team.',
    filterLabel: 'Filter',
    filterAll: 'All',
    statusOpen: 'Open',
    statusResolved: 'Resolved',
    emptyOpen: 'No open complaints',
    emptyGeneric: 'No complaints',
    unknownRaiser: 'Unknown',
    raisedByPrefix: 'By',
    toSm: 'To: Site Manager',
    toOwner: 'To: Owner',
    privateBadge: 'Private to Owner',
    attachmentsSuffix: 'photo(s)',
    resolve: 'Mark resolved',
    resolving: 'Resolving…',
    resolvedNotice: 'Marked resolved',
    conflictNotice: 'This complaint was already resolved — the list has been refreshed.',
  },
  hi: {
    title: 'शिकायतें',
    subtitle: 'आपकी टीम द्वारा दर्ज की गई शिकायतें।',
    filterLabel: 'फ़िल्टर',
    filterAll: 'सभी',
    statusOpen: 'खुली',
    statusResolved: 'हल हो गई',
    emptyOpen: 'कोई खुली शिकायत नहीं',
    emptyGeneric: 'कोई शिकायत नहीं',
    unknownRaiser: 'अज्ञात',
    raisedByPrefix: 'द्वारा',
    toSm: 'भेजा: साइट मैनेजर को',
    toOwner: 'भेजा: मालिक को',
    privateBadge: 'सिर्फ़ मालिक के लिए निजी',
    attachmentsSuffix: 'फ़ोटो',
    resolve: 'हल हुआ चिह्नित करें',
    resolving: 'हल किया जा रहा है…',
    resolvedNotice: 'हल हुआ चिह्नित किया गया',
    conflictNotice: 'यह शिकायत पहले ही हल हो चुकी थी — सूची ताज़ा कर दी गई है।',
  },
} as const;

const STATUS_CLASS: Record<IssueStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

export function ComplaintsInboxScreen({ role }: { role: InboxRole }) {
  const locale = useLocale();
  const ui = UI[locale];
  const m = useMessages();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState<UUID | null>(null);

  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const complaintsQ = useQuery({
    queryKey: ['complaints', filter],
    queryFn: () => api<Complaint[]>('GET', filter === 'ALL' ? '/complaints' : `/complaints?status=${filter}`),
  });

  const usersById = useMemo(() => {
    const map = new Map<UUID, User>();
    for (const u of usersQ.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQ.data]);
  const nameOf = (id: UUID) => usersById.get(id)?.name ?? ui.unknownRaiser;

  const resolve = useMutation({
    mutationFn: (id: UUID) => api<Complaint>('POST', `/complaints/${id}/resolve`),
    onSuccess: (updated) => {
      setDone(updated.id);
      setConflict(false);
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (err) => {
      setDone(null);
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        setConflict(true);
        void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      }
    },
  });

  const serverError =
    resolve.error instanceof ApiClientError && resolve.error.code !== 'CONFLICT'
      ? apiErrorMessage(m, resolve.error.code)
      : resolve.error && !(resolve.error instanceof ApiClientError)
        ? apiErrorMessage(m)
        : null;

  const rows = complaintsQ.data ?? [];

  return (
    <div className="grid gap-4" data-testid="complaints-inbox-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={ui.filterLabel}>
            {(['OPEN', 'RESOLVED', 'ALL'] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? 'default' : 'outline'}
                role="tab"
                aria-selected={filter === f}
                data-testid={`complaints-filter-${f}`}
                onClick={() => {
                  setFilter(f);
                  setConflict(false);
                }}
              >
                {f === 'ALL' ? ui.filterAll : f === 'OPEN' ? ui.statusOpen : ui.statusResolved}
              </Button>
            ))}
          </div>

          {conflict && (
            <Notice tone="warning" testId="complaints-conflict">
              {ui.conflictNotice}
            </Notice>
          )}
          {serverError && (
            <Notice tone="error" testId="complaints-error">
              {serverError}
            </Notice>
          )}
        </CardContent>
      </Card>

      {complaintsQ.isPending || usersQ.isPending ? (
        <LoadingState />
      ) : complaintsQ.error ? (
        <ErrorState error={complaintsQ.error} onRetry={() => void complaintsQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState label={filter === 'OPEN' ? ui.emptyOpen : ui.emptyGeneric} />
      ) : (
        <ShowMore
          items={rows}
          initial={10}
          as="ul"
          className="grid gap-3"
          testIdPrefix="complaints-list"
          renderItem={(c) => {
            const busy = resolve.isPending && resolve.variables === c.id;
            const canResolve = c.status === 'OPEN' && (role === 'OWNER' || c.target === 'SITE_MANAGER');
            return (
              <li key={c.id}>
                <Card data-testid={`complaint-card-${c.id}`}>
                  <CardContent className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {ui.raisedByPrefix} {nameOf(c.raisedBy)} · {c.target === 'SITE_MANAGER' ? ui.toSm : ui.toOwner}
                      </span>
                      <span
                        data-testid={`complaint-status-${c.id}`}
                        className={cn(
                          'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                          STATUS_CLASS[c.status],
                        )}
                      >
                        {c.status === 'OPEN' ? ui.statusOpen : ui.statusResolved}
                      </span>
                    </div>

                    {role === 'OWNER' && c.target === 'OWNER' && (
                      <span
                        className="inline-block w-fit rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400"
                        data-testid={`complaint-private-badge-${c.id}`}
                      >
                        {ui.privateBadge}
                      </span>
                    )}

                    <p className="text-sm whitespace-pre-wrap">{c.text}</p>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">{formatKolkataDateTime(c.createdAt)}</span>
                      {c.mediaIds.length > 0 && (
                        <span className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" aria-hidden="true" />
                          {c.mediaIds.length} {ui.attachmentsSuffix}
                        </span>
                      )}
                    </div>

                    {done === c.id && (
                      <Notice tone="success" testId={`complaint-done-${c.id}`}>
                        {ui.resolvedNotice}
                      </Notice>
                    )}

                    {canResolve && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit"
                        disabled={busy}
                        data-testid={`complaint-resolve-${c.id}`}
                        onClick={() => {
                          setDone(null);
                          setConflict(false);
                          resolve.mutate(c.id);
                        }}
                      >
                        {busy ? ui.resolving : ui.resolve}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          }}
        />
      )}
    </div>
  );
}
