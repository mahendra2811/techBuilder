'use client';

/**
 * Approvals inbox (Owner + SM + TH — one component, three thin route wrappers).
 * Lists requests visible in the caller's scope (GET /requests, server-scoped)
 * and offers Approve / Reject only where the role may actually decide — the UI
 * mirrors the backend rules exactly so users never hit a surprise 403:
 *   - never your OWN request (backend SELF_APPROVAL/FORBIDDEN),
 *   - Owner decides anything; SM decides in-scope site requests; TH decides
 *     ONLY VEHICLE_SWITCH + EXPENSE_ADD from their own crew (never LEAVE/MATERIAL),
 *   - a requester in the scoped GET /users list ⟺ in-scope (the users list is
 *     scope-filtered identically to the requests list), so presence proxies scope.
 * A decided request cannot be re-decided (CONFLICT) → we refetch + notify.
 *
 * EXPENSE_ADD gets two extras mirroring the backend (approvals.service.ts):
 *   - a category-override select (the decider sets the FINAL category on approve),
 *   - a required-comment client check on reject (the backend also rejects an
 *     empty comment for EXPENSE_ADD with VALIDATION_FAILED {comment:'required'}).
 *
 * WO-7 (wave 2): Owner-only per-site tabs (derived client-side — payload.siteId,
 * falling back to the requester's assignedSiteId; ApprovalRequest has no siteId
 * column, so no backend change) + an accordion list — a PENDING row collapses to
 * name/type/one-liner/status and expands on tap to the full payload + decide
 * form; a decided row never expands (nothing left to do, so nothing to reveal).
 *
 * Round 2 (CW-3): the ACCOUNTANT variant — he decides EXPENSE_ADD only (mirrors the
 * backend's assertDecideScope: "the accountant decides money requests only"), and his
 * approve IS the verify tick in one act (decideRequest auto-stamps verifiedBy/verifiedAt
 * when the decider is ACCOUNTANT/OWNER) — no separate verify step for a row HE decided.
 * Two-tick extras layered on top of the existing decide UI, for every viewer:
 *   - a ✓ Verified / 🚩 Flagged badge on a decided EXPENSE_ADD row that carries a verdict,
 *   - for ACCOUNTANT/OWNER viewers, a verify ✓ / flag 🚩 action on an APPROVED EXPENSE_ADD
 *     row that is NOT yet verified/flagged (an SM's own approval stays unverified until the
 *     accountant separately ticks it via POST /requests/:id/verify).
 * NOTE: GET /requests has no ACCOUNTANT scope branch server-side yet (falls back to
 * "own requests only", same gap as GET /users) — this is a known backend gap (not fixed
 * here, out of web-only scope): an accountant's PENDING tab will only ever show requests
 * he raised himself, which self-approval already excludes, so it will read empty in
 * practice until that's fixed upstream. The dashboard's "pending requests" quick view
 * (GET /accountant/queue) is unaffected — that endpoint IS correctly site-scoped.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Flag } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type {
  ApprovalRequest,
  ApprovalStatus,
  DecideRequestInput,
  ExpenseCategory,
  Site,
  User,
  UUID,
  VerifyInput,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { formatKolkataDateTime } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { PayloadSummary, RequestStatusBadge, payloadOneLiner } from '@/components/requests/request-bits';
import { cn } from '@/lib/utils';

type DecideRole = 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR' | 'ACCOUNTANT';
type Filter = ApprovalStatus | 'ALL';

// Module-local — the frozen APPROVALS_UI catalog predates the two-tick verify/flag UI.
const VERIFY_UI = {
  en: {
    verifiedBadge: '✓ Verified',
    flaggedBadge: '🚩 Flagged',
    verify: 'Verify',
    flag: 'Flag',
    flagNotePlaceholder: "What didn't match?",
    flagNoteRequired: 'A note is required to flag',
    flagSubmit: 'Submit flag',
    cancel: 'Cancel',
    verifying: 'Saving…',
    verifiedNotice: 'Verified.',
    flaggedNotice: 'Flagged.',
  },
  hi: {
    verifiedBadge: '✓ सत्यापित',
    flaggedBadge: '🚩 फ़्लैग किया',
    verify: 'सत्यापित करें',
    flag: 'फ़्लैग करें',
    flagNotePlaceholder: 'क्या मेल नहीं खाया?',
    flagNoteRequired: 'फ़्लैग करने के लिए नोट ज़रूरी है',
    flagSubmit: 'फ़्लैग भेजें',
    cancel: 'रद्द करें',
    verifying: 'सेव हो रहा है…',
    verifiedNotice: 'सत्यापित हो गया।',
    flaggedNotice: 'फ़्लैग कर दिया।',
  },
} as const;

export function ApprovalsScreen({ role }: { role: DecideRole }) {
  const m = useMessages();
  const locale = useLocale();
  const verifyUi = VERIFY_UI[locale];
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [siteTab, setSiteTab] = useState<'ALL' | UUID>('ALL');
  const [expandedId, setExpandedId] = useState<UUID | null>(null);
  const [comments, setComments] = useState<Record<UUID, string>>({});
  const [categoryOverrides, setCategoryOverrides] = useState<Record<UUID, ExpenseCategory>>({});
  const [rejectErrors, setRejectErrors] = useState<Record<UUID, string>>({});
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState<{ id: UUID; approved: boolean } | null>(null);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites'), enabled: role === 'OWNER' });
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

  /** payload.siteId (EXPENSE_ADD etc.) first, else the requester's assignedSiteId — client-derived,
   * ApprovalRequest has no siteId column. Returns null when neither resolves ("Other" bucket). */
  const siteIdFor = (r: ApprovalRequest): UUID | null => {
    const fromPayload = typeof r.payload.siteId === 'string' ? (r.payload.siteId as UUID) : null;
    return fromPayload ?? usersById.get(r.requestedBy)?.assignedSiteId ?? null;
  };

  /** Mirrors the backend decide rules (see file header). */
  const canDecide = (r: ApprovalRequest): boolean => {
    if (r.status !== 'PENDING') return false;
    if (!myUserId || r.requestedBy === myUserId) return false;
    if (role === 'OWNER') return true;
    // Round 2: the SUPERVISOR decides NOTHING — this screen is read-only crew visibility for him.
    if (role === 'SUPERVISOR') return false;
    // CW-3: the accountant decides money requests only (assertDecideScope server-side).
    if (role === 'ACCOUNTANT' && r.type !== 'EXPENSE_ADD') return false;
    return usersById.has(r.requestedBy); // in-scope requester ⟺ present in scoped users list
  };

  /** CW-3 two-tick: ACCOUNTANT/OWNER may separately verify/flag an APPROVED EXPENSE_ADD row
   * that nobody has ticked yet (an SM's own approval stays unverified — see file header). */
  const canVerify = (r: ApprovalRequest): boolean =>
    (role === 'ACCOUNTANT' || role === 'OWNER') &&
    r.type === 'EXPENSE_ADD' &&
    r.status === 'APPROVED' &&
    !r.verifiedAt &&
    !r.flagged;

  /** EXPENSE_ADD category-override select: the decider's pick, defaulting to the payload's category. */
  const categoryFor = (r: ApprovalRequest): ExpenseCategory => {
    const chosen = categoryOverrides[r.id];
    if (chosen) return chosen;
    const fromPayload = r.payload.category;
    return typeof fromPayload === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(fromPayload)
      ? (fromPayload as ExpenseCategory)
      : 'MISC';
  };

  const decide = useMutation({
    mutationFn: ({
      id,
      approve,
      comment,
      categoryOverride,
    }: {
      id: UUID;
      approve: boolean;
      comment?: string;
      categoryOverride?: ExpenseCategory;
    }) => {
      const body: DecideRequestInput = {
        approve,
        ...(comment ? { comment } : {}),
        ...(categoryOverride ? { categoryOverride } : {}),
      };
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
      setRejectErrors((e) => {
        if (!(updated.id in e)) return e;
        const next = { ...e };
        delete next[updated.id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (err, variables) => {
      setDone(null);
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        setConflict(true);
        void queryClient.invalidateQueries({ queryKey: ['requests'] });
        return;
      }
      // Backend requires a non-empty comment when rejecting EXPENSE_ADD — surface the
      // specific reason inline instead of the generic "future date" VALIDATION_FAILED copy.
      if (err instanceof ApiClientError && err.code === 'VALIDATION_FAILED' && err.fields?.comment === 'required') {
        setRejectErrors((e) => ({ ...e, [variables.id]: m.APPROVALS_UI.rejectReasonRequired }));
      }
    },
  });

  const submitDecision = (r: ApprovalRequest, approve: boolean) => {
    setDone(null);
    setConflict(false);
    const comment = comments[r.id]?.trim() || undefined;
    if (!approve && r.type === 'EXPENSE_ADD' && !comment) {
      setRejectErrors((e) => ({ ...e, [r.id]: m.APPROVALS_UI.rejectReasonRequired }));
      return;
    }
    setRejectErrors((e) => {
      if (!(r.id in e)) return e;
      const next = { ...e };
      delete next[r.id];
      return next;
    });
    decide.mutate({
      id: r.id,
      approve,
      comment,
      categoryOverride: approve && r.type === 'EXPENSE_ADD' ? categoryFor(r) : undefined,
    });
  };

  // CW-3 two-tick: ACCOUNTANT/OWNER verify ✓ / flag 🚩 an APPROVED EXPENSE_ADD request
  // that nobody has ticked yet (POST /requests/:id/verify — VerifySchema {ok, flagNote?}).
  const [verifyFlagging, setVerifyFlagging] = useState<Record<UUID, boolean>>({});
  const [verifyNotes, setVerifyNotes] = useState<Record<UUID, string>>({});
  const [verifyNoteErrors, setVerifyNoteErrors] = useState<Record<UUID, string>>({});
  const [verifyDone, setVerifyDone] = useState<{ id: UUID; ok: boolean } | null>(null);

  const verify = useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: VerifyInput }) =>
      api<ApprovalRequest>('POST', `/requests/${id}/verify`, input),
    onSuccess: (updated) => {
      setVerifyDone({ id: updated.id, ok: !updated.flagged });
      setVerifyFlagging((f) => ({ ...f, [updated.id]: false }));
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['accountant-queue'] });
    },
  });

  const submitVerify = (r: ApprovalRequest, ok: boolean) => {
    setVerifyDone(null);
    if (!ok) {
      const note = verifyNotes[r.id]?.trim();
      if (!note) {
        setVerifyNoteErrors((e) => ({ ...e, [r.id]: verifyUi.flagNoteRequired }));
        return;
      }
      verify.mutate({ id: r.id, input: { ok: false, flagNote: note } });
      return;
    }
    verify.mutate({ id: r.id, input: { ok: true } });
  };

  const verifyServerError =
    verify.error instanceof ApiClientError ? apiErrorMessage(m, verify.error.code) : verify.error ? apiErrorMessage(m) : null;

  const serverError =
    decide.error instanceof ApiClientError &&
    decide.error.code !== 'CONFLICT' &&
    !(decide.error.code === 'VALIDATION_FAILED' && decide.error.fields?.comment === 'required')
      ? apiErrorMessage(m, decide.error.code)
      : decide.error && !(decide.error instanceof ApiClientError)
        ? apiErrorMessage(m)
        : null;

  const requests = requestsQ.data ?? [];
  const siteFiltered =
    role === 'OWNER' && siteTab !== 'ALL' ? requests.filter((r) => siteIdFor(r) === siteTab) : requests;
  const sites = sitesQ.data ?? [];

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

          {/* WO-7: site tabs, Owner only — SM/TH already see just their own scope. */}
          {role === 'OWNER' && sites.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={m.APPROVALS_UI.siteFilterLabel}>
              <Button
                type="button"
                size="sm"
                variant={siteTab === 'ALL' ? 'default' : 'outline'}
                role="tab"
                aria-selected={siteTab === 'ALL'}
                data-testid="approvals-site-ALL"
                onClick={() => setSiteTab('ALL')}
              >
                {m.APPROVALS_UI.siteFilterAll}
              </Button>
              {sites.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={siteTab === s.id ? 'default' : 'outline'}
                  role="tab"
                  aria-selected={siteTab === s.id}
                  data-testid={`approvals-site-${s.id}`}
                  onClick={() => setSiteTab(s.id)}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          )}

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
      ) : siteFiltered.length === 0 ? (
        <EmptyState label={filter === 'PENDING' ? m.APPROVALS_UI.emptyPending : m.APPROVALS_UI.emptyGeneric} />
      ) : (
        <ShowMore
          items={siteFiltered}
          initial={10}
          as="ul"
          className="grid gap-3"
          testIdPrefix="approvals-list"
          renderItem={(r) => {
            const decidable = canDecide(r);
            const verifiable = canVerify(r);
            const isOwn = r.requestedBy === myUserId;
            const busy = decide.isPending && decide.variables?.id === r.id;
            const verifyBusy = verify.isPending && verify.variables?.id === r.id;
            const isPending = r.status === 'PENDING';
            const isExpanded = isPending && expandedId === r.id;
            const oneLiner = payloadOneLiner(m, r.type, r.payload);
            // Two-tick badge: only meaningful once decided, and only for money requests.
            const showTickBadge = r.type === 'EXPENSE_ADD' && r.status === 'APPROVED' && (!!r.verifiedAt || r.flagged);
            return (
              <li key={r.id}>
                <Card data-testid={`approval-card-${r.id}`}>
                  <button
                    type="button"
                    className={cn('flex w-full items-start justify-between gap-2 px-(--card-spacing) text-left', !isPending && 'cursor-default')}
                    data-testid={`approval-row-${r.id}`}
                    aria-expanded={isPending ? isExpanded : undefined}
                    aria-label={isPending ? (isExpanded ? m.APPROVALS_UI.collapseAria : m.APPROVALS_UI.expandAria) : undefined}
                    onClick={isPending ? () => setExpandedId((cur) => (cur === r.id ? null : r.id)) : undefined}
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" data-testid={`approval-type-${r.id}`}>
                          {m.APPROVAL_TYPE_LABELS[r.type]}
                        </span>
                        <RequestStatusBadge status={r.status} />
                        {showTickBadge && (
                          <span
                            data-testid={`approval-tick-${r.id}`}
                            className={cn(
                              'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                              r.flagged
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                            )}
                          >
                            {r.flagged ? verifyUi.flaggedBadge : verifyUi.verifiedBadge}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {nameOf(r.requestedBy)}
                        {oneLiner ? ` · ${oneLiner}` : ''} · {formatKolkataDateTime(r.createdAt)}
                      </p>
                    </div>
                    {isPending && (
                      <ChevronDown
                        className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {!isPending && (
                    <p className="px-(--card-spacing) pb-(--card-spacing) text-xs text-muted-foreground" data-testid={`approval-decided-${r.id}`}>
                      {m.APPROVALS_UI.decidedByPrefix}: {r.approverUserId ? nameOf(r.approverUserId) : '—'}
                      {r.decidedAt ? ` · ${formatKolkataDateTime(r.decidedAt)}` : ''}
                      {r.comment ? ` · ${r.comment}` : ''}
                    </p>
                  )}

                  {verifiable && verifyDone?.id !== r.id && (
                    <div className="grid gap-2 px-(--card-spacing) pb-(--card-spacing)">
                      {!verifyFlagging[r.id] ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            data-testid={`approval-verify-flag-${r.id}`}
                            disabled={verifyBusy}
                            onClick={() => setVerifyFlagging((f) => ({ ...f, [r.id]: true }))}
                          >
                            <Flag className="size-3.5" aria-hidden="true" />
                            {verifyUi.flag}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className={cn('bg-emerald-600 text-white hover:bg-emerald-600/90')}
                            data-testid={`approval-verify-ok-${r.id}`}
                            disabled={verifyBusy}
                            onClick={() => submitVerify(r, true)}
                          >
                            <Check className="size-3.5" aria-hidden="true" />
                            {verifyBusy ? verifyUi.verifying : verifyUi.verify}
                          </Button>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Textarea
                            aria-label={verifyUi.flagNotePlaceholder}
                            placeholder={verifyUi.flagNotePlaceholder}
                            className="min-h-14"
                            data-testid={`approval-verify-note-${r.id}`}
                            value={verifyNotes[r.id] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setVerifyNotes((n) => ({ ...n, [r.id]: value }));
                              setVerifyNoteErrors((err) => {
                                if (!(r.id in err)) return err;
                                const next = { ...err };
                                delete next[r.id];
                                return next;
                              });
                            }}
                          />
                          {verifyNoteErrors[r.id] && (
                            <p className="text-sm text-destructive" role="alert" data-testid={`approval-verify-note-error-${r.id}`}>
                              {verifyNoteErrors[r.id]}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              data-testid={`approval-verify-flag-cancel-${r.id}`}
                              onClick={() => setVerifyFlagging((f) => ({ ...f, [r.id]: false }))}
                            >
                              {verifyUi.cancel}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              data-testid={`approval-verify-flag-submit-${r.id}`}
                              disabled={verifyBusy}
                              onClick={() => submitVerify(r, false)}
                            >
                              {verifyBusy ? verifyUi.verifying : verifyUi.flagSubmit}
                            </Button>
                          </div>
                        </div>
                      )}
                      {verifyServerError && verify.variables?.id === r.id && (
                        <Notice tone="error" testId={`approval-verify-error-${r.id}`}>
                          {verifyServerError}
                        </Notice>
                      )}
                    </div>
                  )}

                  {verifyDone?.id === r.id && (
                    <div className="px-(--card-spacing) pb-(--card-spacing)">
                      <Notice tone={verifyDone.ok ? 'success' : 'warning'} testId={`approval-verify-done-${r.id}`}>
                        {verifyDone.ok ? verifyUi.verifiedNotice : verifyUi.flaggedNotice}
                      </Notice>
                    </div>
                  )}

                  {done?.id === r.id && (
                    <div className="px-(--card-spacing) pb-(--card-spacing)">
                      <Notice tone={done.approved ? 'success' : 'warning'} testId={`approval-done-${r.id}`}>
                        {done.approved ? m.APPROVALS_UI.approvedNotice : m.APPROVALS_UI.rejectedNotice}
                      </Notice>
                    </div>
                  )}

                  {isExpanded && (
                    <CardContent className="grid gap-3 pt-0">
                      <PayloadSummary type={r.type} payload={r.payload} />

                      {isOwn && (
                        <p className="text-xs text-muted-foreground" data-testid={`approval-own-${r.id}`}>
                          {m.APPROVALS_UI.ownRequestNote}
                        </p>
                      )}

                      {decidable && (
                        <div className="grid gap-2">
                          {r.type === 'EXPENSE_ADD' && (
                            <div className="grid gap-1.5">
                              <Label htmlFor={`approval-category-${r.id}`}>{m.APPROVALS_UI.finalCategoryLabel}</Label>
                              <NativeSelect
                                id={`approval-category-${r.id}`}
                                data-testid={`approval-category-${r.id}`}
                                value={categoryFor(r)}
                                onChange={(e) =>
                                  setCategoryOverrides((c) => ({ ...c, [r.id]: e.target.value as ExpenseCategory }))
                                }
                              >
                                {EXPENSE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {m.EXPENSE_CATEGORY_LABELS[cat]}
                                  </option>
                                ))}
                              </NativeSelect>
                            </div>
                          )}
                          <Textarea
                            aria-label={m.APPROVALS_UI.commentLabel}
                            placeholder={m.APPROVALS_UI.commentPlaceholder}
                            className="min-h-16"
                            data-testid={`approval-comment-${r.id}`}
                            value={comments[r.id] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setComments((c) => ({ ...c, [r.id]: value }));
                              setRejectErrors((err) => {
                                if (!(r.id in err)) return err;
                                const next = { ...err };
                                delete next[r.id];
                                return next;
                              });
                            }}
                          />
                          {rejectErrors[r.id] && (
                            <p className="text-sm text-destructive" role="alert" data-testid={`approval-reject-error-${r.id}`}>
                              {rejectErrors[r.id]}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              data-testid={`approval-reject-${r.id}`}
                              disabled={busy}
                              onClick={() => submitDecision(r, false)}
                            >
                              {busy ? m.APPROVALS_UI.deciding : m.APPROVALS_UI.reject}
                            </Button>
                            <Button
                              type="button"
                              className={cn('bg-emerald-600 text-white hover:bg-emerald-600/90')}
                              data-testid={`approval-approve-${r.id}`}
                              disabled={busy}
                              onClick={() => submitDecision(r, true)}
                            >
                              {busy ? m.APPROVALS_UI.deciding : m.APPROVALS_UI.approve}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </li>
            );
          }}
        />
      )}
    </div>
  );
}
