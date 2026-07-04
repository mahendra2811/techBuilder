'use client';

/**
 * Approvals inbox (Owner + SM + TH — one component, three thin route wrappers).
 * Lists requests visible in the caller's scope (GET /requests, server-scoped)
 * and offers Approve / Reject only where the role may actually decide — the UI
 * mirrors the backend rules exactly so users never hit a surprise 403:
 *   - never your OWN request (backend SELF_APPROVAL/FORBIDDEN),
 *   - Owner decides anything; SM decides in-scope site requests; TH decides
 *     ONLY VEHICLE_SWITCH from their own crew (never LEAVE/MATERIAL),
 *   - a requester in the scoped GET /users list ⟺ in-scope (the users list is
 *     scope-filtered identically to the requests list), so presence proxies scope.
 * A decided request cannot be re-decided (CONFLICT) → we refetch + notify.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalRequest, ApprovalStatus, DecideRequestInput, User, UUID } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { formatKolkataDateTime } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { PayloadSummary, RequestStatusBadge } from '@/components/requests/request-bits';
import { cn } from '@/lib/utils';

type DecideRole = 'OWNER' | 'SITE_MANAGER' | 'TEAM_HEAD';
type Filter = ApprovalStatus | 'ALL';

export function ApprovalsScreen({ role }: { role: DecideRole }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [comments, setComments] = useState<Record<UUID, string>>({});
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState<{ id: UUID; approved: boolean } | null>(null);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const requestsQ = useQuery({
    queryKey: ['requests', filter],
    queryFn: () => api<ApprovalRequest[]>('GET', filter === 'ALL' ? '/requests' : `/requests?status=${filter}`),
  });

  const myUserId = meQ.data?.user.id;
  const usersById = useMemo(() => {
    const map = new Map<UUID, User>();
    for (const u of usersQ.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQ.data]);
  const nameOf = (id: UUID) => usersById.get(id)?.name ?? m.APPROVALS_UI.unknownRequester;

  /** Mirrors the backend decide rules (see file header). */
  const canDecide = (r: ApprovalRequest): boolean => {
    if (r.status !== 'PENDING') return false;
    if (!myUserId || r.requestedBy === myUserId) return false;
    if (role === 'OWNER') return true;
    if (role === 'TEAM_HEAD' && r.type !== 'VEHICLE_SWITCH') return false;
    return usersById.has(r.requestedBy); // in-scope requester ⟺ present in scoped users list
  };

  const decide = useMutation({
    mutationFn: ({ id, approve, comment }: { id: UUID; approve: boolean; comment?: string }) => {
      const body: DecideRequestInput = { approve, ...(comment ? { comment } : {}) };
      return api<ApprovalRequest>('POST', `/requests/${id}/decide`, body);
    },
    onSuccess: (updated) => {
      setDone({ id: updated.id, approved: updated.status === 'APPROVED' });
      setConflict(false);
      setComments((c) => {
        const next = { ...c };
        delete next[updated.id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (err) => {
      setDone(null);
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        setConflict(true);
        void queryClient.invalidateQueries({ queryKey: ['requests'] });
      }
    },
  });

  const submitDecision = (id: UUID, approve: boolean) => {
    setDone(null);
    setConflict(false);
    decide.mutate({ id, approve, comment: comments[id]?.trim() || undefined });
  };

  const serverError =
    decide.error instanceof ApiClientError && decide.error.code !== 'CONFLICT'
      ? apiErrorMessage(m, decide.error.code)
      : decide.error && !(decide.error instanceof ApiClientError)
        ? apiErrorMessage(m)
        : null;

  const requests = requestsQ.data ?? [];

  return (
    <div className="grid gap-4" data-testid="approvals-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.APPROVALS_UI.title}</CardTitle>
          <CardDescription>{m.APPROVALS_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={m.APPROVALS_UI.filterLabel}>
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? 'default' : 'outline'}
                role="tab"
                aria-selected={filter === f}
                data-testid={`approvals-filter-${f}`}
                onClick={() => {
                  setFilter(f);
                  setConflict(false);
                }}
              >
                {f === 'ALL' ? m.APPROVALS_UI.filterAll : m.APPROVAL_STATUS_LABELS[f]}
              </Button>
            ))}
          </div>

          {conflict && (
            <Notice tone="warning" testId="approvals-conflict">
              {m.APPROVALS_UI.conflictNotice}
            </Notice>
          )}
          {serverError && (
            <Notice tone="error" testId="approvals-error">
              {serverError}
            </Notice>
          )}
        </CardContent>
      </Card>

      {requestsQ.isPending || usersQ.isPending || meQ.isPending ? (
        <LoadingState />
      ) : requestsQ.error ? (
        <ErrorState error={requestsQ.error} onRetry={() => void requestsQ.refetch()} />
      ) : requests.length === 0 ? (
        <EmptyState label={filter === 'PENDING' ? m.APPROVALS_UI.emptyPending : m.APPROVALS_UI.emptyGeneric} />
      ) : (
        <ul className="grid gap-3">
          {requests.map((r) => {
            const decidable = canDecide(r);
            const isOwn = r.requestedBy === myUserId;
            const busy = decide.isPending && decide.variables?.id === r.id;
            return (
              <li key={r.id}>
                <Card data-testid={`approval-card-${r.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle data-testid={`approval-type-${r.id}`}>{m.APPROVAL_TYPE_LABELS[r.type]}</CardTitle>
                      <RequestStatusBadge status={r.status} />
                    </div>
                    <CardDescription>
                      {m.APPROVALS_UI.raisedByPrefix}: {nameOf(r.requestedBy)} · {formatKolkataDateTime(r.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <PayloadSummary type={r.type} payload={r.payload} />

                    {r.status !== 'PENDING' && (
                      <p className="text-xs text-muted-foreground" data-testid={`approval-decided-${r.id}`}>
                        {m.APPROVALS_UI.decidedByPrefix}: {r.approverUserId ? nameOf(r.approverUserId) : '—'}
                        {r.decidedAt ? ` · ${formatKolkataDateTime(r.decidedAt)}` : ''}
                        {r.comment ? ` · ${r.comment}` : ''}
                      </p>
                    )}

                    {done?.id === r.id && (
                      <Notice tone={done.approved ? 'success' : 'warning'} testId={`approval-done-${r.id}`}>
                        {done.approved ? m.APPROVALS_UI.approvedNotice : m.APPROVALS_UI.rejectedNotice}
                      </Notice>
                    )}

                    {r.status === 'PENDING' && isOwn && (
                      <p className="text-xs text-muted-foreground" data-testid={`approval-own-${r.id}`}>
                        {m.APPROVALS_UI.ownRequestNote}
                      </p>
                    )}

                    {decidable && (
                      <div className="grid gap-2">
                        <Textarea
                          aria-label={m.APPROVALS_UI.commentLabel}
                          placeholder={m.APPROVALS_UI.commentPlaceholder}
                          className="min-h-16"
                          data-testid={`approval-comment-${r.id}`}
                          value={comments[r.id] ?? ''}
                          onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            data-testid={`approval-reject-${r.id}`}
                            disabled={busy}
                            onClick={() => submitDecision(r.id, false)}
                          >
                            {busy ? m.APPROVALS_UI.deciding : m.APPROVALS_UI.reject}
                          </Button>
                          <Button
                            type="button"
                            className={cn('bg-emerald-600 text-white hover:bg-emerald-600/90')}
                            data-testid={`approval-approve-${r.id}`}
                            disabled={busy}
                            onClick={() => submitDecision(r.id, true)}
                          >
                            {busy ? m.APPROVALS_UI.deciding : m.APPROVALS_UI.approve}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
