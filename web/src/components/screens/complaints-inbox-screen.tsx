'use client';

/**
 * CW-10 complaint box — inbox side (SITE_MANAGER + OWNER; one component, two
 * thin route wrappers, same shape as approvals-screen.tsx).
 *
 * frozen.10 (SM-1) rework:
 *   - Server-side load-more paging (`useLoadMore` over GET /complaints?limit=&offset=,
 *     `LoadMoreButton`) instead of the old render-only `<ShowMore>` over a single
 *     unpaged fetch.
 *   - A numeric #no search box (`GET /complaints?no=`) that swaps the list for the
 *     single hit; clearing (or editing the box) reverts to the paged list.
 *   - Rows are now summary-only (#no, status badge, date, raiser — no body text);
 *     tapping one opens an in-page detail SUB-PAGE (the vendors shop-detail
 *     pattern — URL never changes, `SubPageHeader`'s back button returns to the
 *     list) showing who raised it, the target, the full text, an attachment
 *     count + placeholder chips (no media-read endpoint yet — R2 absent), and
 *     the Resolve action (moved out of the list row into here).
 *   - SITE_MANAGER gets two tabs: "Inbox" (complaints addressed to him) and
 *     "My complaints" (what he himself raised) — GET /complaints already
 *     returns BOTH merged for an SM (ComplaintsService.list's `or(...)`), so
 *     this screen just splits that one fetch client-side by `raisedBy`. The
 *     My-complaints tab also carries a small raise-to-Owner form (target is
 *     fixed — no picker; an SM has nobody-but-the-Owner to complain to).
 *   - Dropped the old OPEN/RESOLVED/ALL filter chips: paging + the status badge
 *     on every row already surface it, and mixing a status query param into the
 *     load-more offset math wasn't asked for — see the role-page-map spec.
 *
 * Visibility is entirely server-enforced (ComplaintsService.list):
 *   - SITE_MANAGER: target=SITE_MANAGER complaints on his own site(s) PLUS
 *     whatever HE raised (any target, via `raisedBy`).
 *   - OWNER: every complaint, including target=OWNER ones — those are marked
 *     "private to Owner" here as a reminder; the privacy itself is the backend
 *     never sending an OWNER-target row (raised by someone else) to an SM.
 *
 * Raiser names: resolved client-side against the same scoped GET /users list
 * the approvals-screen uses (a raiser outside that scope falls back to an
 * "unknown" label — same documented approach, not a bug).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query';
import { Paperclip, Search, X } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import type { Complaint, IssueStatus, User, UUID, CreateComplaintInput } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { uploadPhotos } from '@/lib/media-upload';
import { formatKolkataDateTime } from '@/lib/business-date';
import { apiErrorMessage, apiErrorOf, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { useLoadMore, LoadMoreButton } from '@/components/ui/load-more-list';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type InboxRole = 'SITE_MANAGER' | 'OWNER';
type SmTab = 'inbox' | 'mine';

const PAGE_SIZE = 8;
const MAX_PHOTOS = 3;

const UI = {
  en: {
    title: 'Complaints',
    subtitle: 'Complaints raised by your team.',
    tabInbox: 'Inbox',
    tabMine: 'My complaints',
    searchLabel: 'Find by number',
    searchPlaceholder: '#101',
    searchButton: 'Find',
    searchClear: 'Clear',
    searchNotFound: 'No complaint found with that number.',
    statusOpen: 'Open',
    statusResolved: 'Resolved',
    empty: 'No complaints',
    emptyMine: "You haven't raised any complaints yet",
    unknownRaiser: 'Unknown',
    toSm: 'To: Site Manager',
    toOwner: 'To: Owner',
    privateBadge: 'Private to Owner',
    attachmentsTitle: 'Attachments',
    attachmentsNone: 'No attachments',
    photoAttached: 'Photo attached',
    resolve: 'Mark resolved',
    resolving: 'Resolving…',
    resolvedNotice: 'Marked resolved',
    conflictNotice: 'This complaint was already resolved — the list has been refreshed.',
    raisedByLabel: 'Raised by',
    detailTarget: 'Sent to',
    raiseTitle: 'Raise a complaint',
    raiseSubtitle: 'Tell the Owner about a problem — it stays private to him.',
    raiseTarget: 'To the Owner (private)',
    textLabel: 'What happened?',
    textPlaceholder: 'Describe the problem…',
    textRequired: 'Please describe the problem',
    photosLabel: 'Photos (optional)',
    submit: 'Send complaint',
    saving: 'Sending…',
    saved: 'Complaint sent',
    photoNotUploaded: 'Saved, but one or more photos could not be uploaded',
  },
  hi: {
    title: 'शिकायतें',
    subtitle: 'आपकी टीम द्वारा दर्ज की गई शिकायतें।',
    tabInbox: 'इनबॉक्स',
    tabMine: 'मेरी शिकायतें',
    searchLabel: 'नंबर से खोजें',
    searchPlaceholder: '#101',
    searchButton: 'खोजें',
    searchClear: 'साफ़ करें',
    searchNotFound: 'इस नंबर की कोई शिकायत नहीं मिली।',
    statusOpen: 'खुली',
    statusResolved: 'हल हो गई',
    empty: 'कोई शिकायत नहीं',
    emptyMine: 'आपने अभी तक कोई शिकायत दर्ज नहीं की है',
    unknownRaiser: 'अज्ञात',
    toSm: 'भेजा: साइट मैनेजर को',
    toOwner: 'भेजा: मालिक को',
    privateBadge: 'सिर्फ़ मालिक के लिए निजी',
    attachmentsTitle: 'अटैचमेंट',
    attachmentsNone: 'कोई अटैचमेंट नहीं',
    photoAttached: 'फ़ोटो अटैच है',
    resolve: 'हल हुआ चिह्नित करें',
    resolving: 'हल किया जा रहा है…',
    resolvedNotice: 'हल हुआ चिह्नित किया गया',
    conflictNotice: 'यह शिकायत पहले ही हल हो चुकी थी — सूची ताज़ा कर दी गई है।',
    raisedByLabel: 'द्वारा दर्ज',
    detailTarget: 'भेजा गया',
    raiseTitle: 'शिकायत दर्ज करें',
    raiseSubtitle: 'मालिक को किसी समस्या के बारे में बताएं — यह सिर्फ़ उन्हीं को दिखेगी।',
    raiseTarget: 'सिर्फ़ मालिक को (निजी)',
    textLabel: 'क्या हुआ?',
    textPlaceholder: 'समस्या बताएं…',
    textRequired: 'कृपया समस्या बताएं',
    photosLabel: 'फ़ोटो (वैकल्पिक)',
    submit: 'शिकायत भेजें',
    saving: 'भेजा जा रहा है…',
    saved: 'शिकायत भेज दी गई',
    photoNotUploaded: 'सहेजा गया, लेकिन कुछ फ़ोटो अपलोड नहीं हो पाए',
  },
} as const;

type UiText = UiStrings<typeof UI>;

const STATUS_CLASS: Record<IssueStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

export function ComplaintsInboxScreen({ role }: { role: InboxRole }) {
  const locale = useLocale();
  const ui = UI[locale];
  const m = useMessages();
  const [smTab, setSmTab] = useState<SmTab>('inbox');
  const [conflict, setConflict] = useState(false);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const myId = meQ.data?.user.id;

  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const usersById = useMemo(() => {
    const map = new Map<UUID, User>();
    for (const u of usersQ.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQ.data]);
  const nameOf = (id: UUID) => usersById.get(id)?.name ?? ui.unknownRaiser;

  // Patched in-place after a resolve so the list + a still-open detail sub-page
  // reflect the new status without a full reload — `useLoadMore` owns its own
  // items array and has no per-item mutate hook.
  const [overrides, setOverrides] = useState<Record<UUID, Complaint>>({});
  const applyOverride = (updated: Complaint) => setOverrides((prev) => ({ ...prev, [updated.id]: updated }));

  const list = useLoadMore<Complaint>({
    pageSize: PAGE_SIZE,
    fetchPage: (offset, limit) => api<Complaint[]>('GET', `/complaints?limit=${limit}&offset=${offset}`),
  });
  useEffect(() => {
    void list.loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- number search (same scope as the list — searches whatever this role can see) ----
  const [searchInput, setSearchInput] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const searchQ = useQuery({
    queryKey: ['complaints-search', searchInput.trim()],
    queryFn: () => api<Complaint[]>('GET', `/complaints?no=${encodeURIComponent(searchInput.trim())}`),
    enabled: searchActive && searchInput.trim().length > 0,
  });

  const { current, open, close } = useSubPage<Complaint>();

  const resolve = useMutation({
    mutationFn: (id: UUID) => api<Complaint>('POST', `/complaints/${id}/resolve`),
    onSuccess: (updated) => {
      applyOverride(updated);
      setConflict(false);
      if (current && current.id === updated.id) open(updated);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        setConflict(true);
        void list.loadFirst();
      }
    },
  });

  const resolveServerError =
    resolve.error instanceof ApiClientError && resolve.error.code !== 'CONFLICT'
      ? apiErrorMessage(m, resolve.error.code)
      : resolve.error && !(resolve.error instanceof ApiClientError)
        ? apiErrorMessage(m)
        : null;

  const withOverrides = (rows: Complaint[]) => rows.map((c) => overrides[c.id] ?? c);
  const baseItems = withOverrides(searchActive ? (searchQ.data ?? []) : list.items);

  // SM's merged fetch = SM-addressed (his sites) + his own raised (any target) —
  // split client-side into the two tabs. Owner has no tabs: everything visible.
  const inboxItems = role === 'SITE_MANAGER' ? baseItems.filter((c) => c.raisedBy !== myId) : baseItems;
  const mineItems = role === 'SITE_MANAGER' ? baseItems.filter((c) => c.raisedBy === myId) : [];
  const visibleItems = role === 'OWNER' ? baseItems : smTab === 'inbox' ? inboxItems : mineItems;

  const canResolve = (c: Complaint) => c.status === 'OPEN' && (role === 'OWNER' || c.target === 'SITE_MANAGER');

  return (
    <div className="grid gap-4" data-testid="complaints-inbox-screen">
      {current ? (
        <ComplaintDetail
          c={current}
          role={role}
          ui={ui}
          raiserName={nameOf(current.raisedBy)}
          onBack={close}
          resolve={resolve}
          canResolve={canResolve(current)}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ui.title}</CardTitle>
              <CardDescription>{ui.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {role === 'SITE_MANAGER' && (
                <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label={ui.title}>
                  <Button
                    type="button"
                    size="sm"
                    variant={smTab === 'inbox' ? 'default' : 'outline'}
                    role="tab"
                    aria-selected={smTab === 'inbox'}
                    data-testid="complaints-tab-inbox"
                    onClick={() => setSmTab('inbox')}
                  >
                    {ui.tabInbox}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={smTab === 'mine' ? 'default' : 'outline'}
                    role="tab"
                    aria-selected={smTab === 'mine'}
                    data-testid="complaints-tab-mine"
                    onClick={() => setSmTab('mine')}
                  >
                    {ui.tabMine}
                  </Button>
                </div>
              )}

              <form
                className="flex items-end gap-2"
                data-testid="complaints-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchInput.trim()) setSearchActive(true);
                }}
              >
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="complaint-search">{ui.searchLabel}</Label>
                  <Input
                    id="complaint-search"
                    data-testid="complaints-search-input"
                    inputMode="numeric"
                    placeholder={ui.searchPlaceholder}
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setSearchActive(false);
                    }}
                  />
                </div>
                {searchActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="complaints-search-clear"
                    onClick={() => {
                      setSearchInput('');
                      setSearchActive(false);
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                    {ui.searchClear}
                  </Button>
                ) : (
                  <Button type="submit" size="sm" data-testid="complaints-search-submit">
                    <Search className="size-4" aria-hidden="true" />
                    {ui.searchButton}
                  </Button>
                )}
              </form>

              {conflict && (
                <Notice tone="warning" testId="complaints-conflict">
                  {ui.conflictNotice}
                </Notice>
              )}
              {resolveServerError && (
                <Notice tone="error" testId="complaints-error">
                  {resolveServerError}
                </Notice>
              )}
            </CardContent>
          </Card>

          {role === 'SITE_MANAGER' && smTab === 'mine' && (
            <RaiseComplaintForm
              ui={ui}
              onSaved={() => {
                setSearchActive(false);
                void list.loadFirst();
              }}
            />
          )}

          {searchActive ? (
            searchQ.isPending ? (
              <LoadingState />
            ) : searchQ.error ? (
              <ErrorState error={searchQ.error} onRetry={() => void searchQ.refetch()} />
            ) : visibleItems.length === 0 ? (
              <EmptyState label={ui.searchNotFound} />
            ) : (
              <ComplaintList items={visibleItems} ui={ui} nameOf={nameOf} onOpen={open} />
            )
          ) : list.items.length === 0 && list.loading ? (
            <LoadingState />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.loadFirst()} />
          ) : (
            <>
              {visibleItems.length === 0 ? (
                <EmptyState label={role === 'SITE_MANAGER' && smTab === 'mine' ? ui.emptyMine : ui.empty} />
              ) : (
                <ComplaintList items={visibleItems} ui={ui} nameOf={nameOf} onOpen={open} />
              )}
              {list.hasMore && (
                <div className="flex justify-center">
                  <LoadMoreButton onClick={list.loadMore} loading={list.loading} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List (summary rows only — no body text)
// ---------------------------------------------------------------------------

function ComplaintList({
  items,
  ui,
  nameOf,
  onOpen,
}: {
  items: Complaint[];
  ui: UiText;
  nameOf: (id: UUID) => string;
  onOpen: (c: Complaint) => void;
}) {
  return (
    <ul className="grid gap-2" data-testid="complaints-list">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-input px-3 py-2.5 text-left hover:bg-accent"
            data-testid={`complaint-row-${c.id}`}
            onClick={() => onOpen(c)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">#{c.complaintNo}</span>
              <span className="min-w-0 truncate text-sm">{nameOf(c.raisedBy)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{formatKolkataDateTime(c.createdAt)}</span>
              <span
                data-testid={`complaint-status-${c.id}`}
                className={cn(
                  'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                  STATUS_CLASS[c.status],
                )}
              >
                {c.status === 'OPEN' ? ui.statusOpen : ui.statusResolved}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Detail sub-page — full text, raiser, target, attachments, resolve
// ---------------------------------------------------------------------------

function ComplaintDetail({
  c,
  role,
  ui,
  raiserName,
  onBack,
  resolve,
  canResolve,
}: {
  c: Complaint;
  role: InboxRole;
  ui: UiText;
  raiserName: string;
  onBack: () => void;
  resolve: UseMutationResult<Complaint, unknown, UUID>;
  canResolve: boolean;
}) {
  const busy = resolve.isPending && resolve.variables === c.id;
  const justResolved = resolve.isSuccess && resolve.data?.id === c.id;

  return (
    <div className="grid gap-4" data-testid="complaint-detail">
      <SubPageHeader title={`#${c.complaintNo}`} onBack={onBack} />
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="complaint-detail-status"
              className={cn(
                'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                STATUS_CLASS[c.status],
              )}
            >
              {c.status === 'OPEN' ? ui.statusOpen : ui.statusResolved}
            </span>
            {role === 'OWNER' && c.target === 'OWNER' && (
              <span
                className="inline-block w-fit rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400"
                data-testid="complaint-detail-private-badge"
              >
                {ui.privateBadge}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {ui.raisedByLabel}: {raiserName} · {ui.detailTarget}: {c.target === 'SITE_MANAGER' ? ui.toSm : ui.toOwner}
          </p>
          <p className="text-xs text-muted-foreground">{formatKolkataDateTime(c.createdAt)}</p>

          <p className="text-sm whitespace-pre-wrap" data-testid="complaint-detail-text">
            {c.text}
          </p>

          <div className="grid gap-1.5">
            <p className="text-xs font-medium">
              {ui.attachmentsTitle} {c.mediaIds.length > 0 && `(${c.mediaIds.length})`}
            </p>
            {c.mediaIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">{ui.attachmentsNone}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5" data-testid="complaint-detail-attachments">
                {c.mediaIds.map((mid) => (
                  <span
                    key={mid}
                    className="inline-flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <Paperclip className="size-3" aria-hidden="true" />
                    {ui.photoAttached}
                  </span>
                ))}
              </div>
            )}
          </div>

          {justResolved && (
            <Notice tone="success" testId="complaint-detail-resolved">
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
              data-testid="complaint-detail-resolve"
              onClick={() => resolve.mutate(c.id)}
            >
              {busy ? ui.resolving : ui.resolve}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raise-to-Owner form (SITE_MANAGER, "My complaints" tab only) — target fixed,
// no picker (an SM has nobody-but-the-Owner to complain to). Deliberately NOT
// sharing ComplaintScreen's ComplaintForm (that one is unexported and keeps a
// target picker for the four base raiser roles) — a small self-contained form
// per the role-page-map spec's fallback instruction.
// ---------------------------------------------------------------------------

function RaiseComplaintForm({ ui, onSaved }: { ui: UiText; onSaved: () => void }) {
  const m = useMessages();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [textError, setTextError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const id: UUID = uuidv7();
      const mediaIds = photos.length
        ? await uploadPhotos(photos, { kind: 'PHOTO', parentType: 'complaint', parentId: id })
        : [];
      const input: CreateComplaintInput = {
        id,
        target: 'OWNER',
        text: text.trim(),
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      };
      await api<Complaint>('POST', '/complaints', input);
      return { failed: photos.length > 0 && mediaIds.length < photos.length };
    },
    onSuccess: ({ failed }) => {
      setText('');
      setPhotos([]);
      setSaved(true);
      setPhotoWarning(failed);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setPhotoWarning(false);
    if (!text.trim()) {
      setTextError(ui.textRequired);
      return;
    }
    setTextError(undefined);
    create.mutate();
  };

  const serverError =
    apiErrorOf(m, create.error);

  return (
    <Card data-testid="complaint-raise-form">
      <CardHeader>
        <CardTitle>{ui.raiseTitle}</CardTitle>
        <CardDescription>{ui.raiseSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <span className="inline-flex w-fit items-center rounded-md border border-input bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
            {ui.raiseTarget}
          </span>

          <div className="grid gap-2">
            <Label htmlFor="sm-complaint-text">{ui.textLabel}</Label>
            <Textarea
              id="sm-complaint-text"
              data-testid="sm-complaint-text"
              placeholder={ui.textPlaceholder}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (textError) setTextError(undefined);
              }}
            />
            {textError && (
              <p className="text-sm text-destructive" role="alert">
                {textError}
              </p>
            )}
          </div>

          <PhotoMultiField files={photos} onChange={setPhotos} max={MAX_PHOTOS} label={ui.photosLabel} testId="sm-complaint-photos" />

          {serverError && (
            <Notice tone="error" testId="sm-complaint-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="sm-complaint-saved">
              {ui.saved}
            </Notice>
          )}
          {photoWarning && (
            <Notice tone="warning" testId="sm-complaint-photo-warning">
              {ui.photoNotUploaded}
            </Notice>
          )}

          <Button type="submit" data-testid="sm-complaint-submit" disabled={create.isPending}>
            {create.isPending ? ui.saving : ui.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
