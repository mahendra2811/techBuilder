'use client';

/**
 * CW-10 complaint box — raise side (WORKER / DRIVER / SUPERVISOR / ACCOUNTANT).
 *
 * Raise a complaint addressed to the Site Manager (visible to him AND every
 * Owner — never private) or to the Owner only (private: the SM must never see
 * it — enforced server-side in ComplaintsService.list/resolve, not here). The
 * site is derived server-side from the raiser's own scope; the client never
 * sends one.
 *
 * Media: text is required; up to 3 photos via the shared PhotoMultiField
 * (best-effort upload, same non-blocking pattern as every other entry
 * screen). Video is NOT wired — `PresignMediaInput.kind` only has
 * PHOTO/RECEIPT/VOICE (frozen contracts, no VIDEO), and R2 storage for a
 * ~200-300MB file is a separate, not-yet-built piece (per the Round-2 spec,
 * "blocked on R2") — so this screen shows a disabled hint instead of
 * inventing a contract. See the CW-10 report for this decision.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Paperclip, Video } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import type { Complaint, ComplaintTarget, CreateComplaintInput, UUID } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { uploadPhotos } from '@/lib/media-upload';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatKolkataDateTime } from '@/lib/business-date';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ShowMore } from '@/components/ui/show-more';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

const MAX_PHOTOS = 3;

const UI = {
  en: {
    title: 'Complaint box',
    subtitle: 'Tell your Site Manager or, privately, the Owner about a problem.',
    targetLabel: 'Send to',
    targetSm: 'Site Manager',
    targetOwner: 'Owner only (private)',
    textLabel: 'What happened?',
    textPlaceholder: 'Describe the problem…',
    textRequired: 'Please describe the problem',
    photosLabel: 'Photos (optional)',
    videoHint: 'Video coming soon (storage pending)',
    submit: 'Send complaint',
    saving: 'Sending…',
    saved: 'Complaint sent',
    photoNotUploaded: 'Saved, but one or more photos could not be uploaded',
    myComplaintsTitle: 'My complaints',
    emptyList: 'You have not raised any complaints yet',
    statusOpen: 'Open',
    statusResolved: 'Resolved',
    toSm: 'To: Site Manager',
    toOwner: 'To: Owner (private)',
    attachmentsPrefix: 'photo(s)',
    expandAria: 'View complaint details',
    collapseAria: 'Hide complaint details',
  },
  hi: {
    title: 'शिकायत बॉक्स',
    subtitle: 'अपने साइट मैनेजर को, या निजी तौर पर मालिक को, किसी समस्या के बारे में बताएं।',
    targetLabel: 'किसे भेजें',
    targetSm: 'साइट मैनेजर',
    targetOwner: 'सिर्फ़ मालिक को (निजी)',
    textLabel: 'क्या हुआ?',
    textPlaceholder: 'समस्या बताएं…',
    textRequired: 'कृपया समस्या बताएं',
    photosLabel: 'फ़ोटो (वैकल्पिक)',
    videoHint: 'वीडियो जल्द आ रहा है (सर्वर स्टोरेज लंबित)',
    submit: 'शिकायत भेजें',
    saving: 'भेजा जा रहा है…',
    saved: 'शिकायत भेज दी गई',
    photoNotUploaded: 'सहेजा गया, लेकिन कुछ फ़ोटो अपलोड नहीं हो पाए',
    myComplaintsTitle: 'मेरी शिकायतें',
    emptyList: 'आपने अभी तक कोई शिकायत दर्ज नहीं की है',
    statusOpen: 'खुली',
    statusResolved: 'हल हो गई',
    toSm: 'भेजा: साइट मैनेजर को',
    toOwner: 'भेजा: मालिक को (निजी)',
    attachmentsPrefix: 'फ़ोटो',
    expandAria: 'शिकायत का विवरण देखें',
    collapseAria: 'शिकायत का विवरण छिपाएं',
  },
} as const;

type UiText = Record<keyof (typeof UI)['en'], string>;

const STATUS_CLASS: Record<Complaint['status'], string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

export function ComplaintScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<UUID | null>(null);

  const listQ = useQuery({ queryKey: ['complaints'], queryFn: () => api<Complaint[]>('GET', '/complaints') });

  return (
    <div className="grid gap-4" data-testid="complaint-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ComplaintForm ui={ui} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['complaints'] })} />
        </CardContent>
      </Card>

      <Card size="sm" data-testid="my-complaints">
        <CardHeader>
          <CardTitle>{ui.myComplaintsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isPending ? (
            <LoadingState />
          ) : listQ.error ? (
            <ErrorState error={listQ.error} onRetry={() => void listQ.refetch()} />
          ) : !listQ.data || listQ.data.length === 0 ? (
            <EmptyState label={ui.emptyList} />
          ) : (
            <ShowMore
              items={listQ.data}
              initial={5}
              as="ul"
              className="divide-y"
              testIdPrefix="my-complaints-list"
              renderItem={(c) => {
                const isOpen = openId === c.id;
                return (
                  <li key={c.id} className="py-2 first:pt-0 last:pb-0" data-testid={`my-complaint-row-${c.id}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? ui.collapseAria : ui.expandAria}
                      data-testid={`my-complaint-toggle-${c.id}`}
                      onClick={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">#{c.complaintNo}</span>
                        <span
                          data-testid={`complaint-status-${c.id}`}
                          className={cn(
                            'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                            STATUS_CLASS[c.status],
                          )}
                        >
                          {c.status === 'OPEN' ? ui.statusOpen : ui.statusResolved}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatKolkataDateTime(c.createdAt)}</span>
                      </div>
                      <ChevronDown
                        className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>

                    {isOpen && (
                      <div className="grid gap-1 pt-2" data-testid={`my-complaint-details-${c.id}`}>
                        <span className="text-xs text-muted-foreground">
                          {c.target === 'SITE_MANAGER' ? ui.toSm : ui.toOwner}
                        </span>
                        <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                        {c.mediaIds.length > 0 && (
                          <span className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="size-3" aria-hidden="true" />
                            {c.mediaIds.length} {ui.attachmentsPrefix}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ComplaintForm({ ui, onSaved }: { ui: UiText; onSaved: () => void }) {
  const m = useMessages();
  const [target, setTarget] = useState<ComplaintTarget>('SITE_MANAGER');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [textError, setTextError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const id: UUID = uuidv7();
      const mediaIds = photos.length ? await uploadPhotos(photos, { kind: 'PHOTO', parentType: 'complaint', parentId: id }) : [];
      const input: CreateComplaintInput = {
        id,
        target,
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
    create.error instanceof ApiClientError
      ? apiErrorMessage(m, create.error.code)
      : create.error
        ? apiErrorMessage(m)
        : null;

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit} data-testid="complaint-form">
      <div className="grid gap-2">
        <Label>{ui.targetLabel}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={target === 'SITE_MANAGER' ? 'default' : 'outline'}
            aria-pressed={target === 'SITE_MANAGER'}
            data-testid="complaint-target-sm"
            onClick={() => setTarget('SITE_MANAGER')}
          >
            {ui.targetSm}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={target === 'OWNER' ? 'default' : 'outline'}
            aria-pressed={target === 'OWNER'}
            data-testid="complaint-target-owner"
            onClick={() => setTarget('OWNER')}
          >
            {ui.targetOwner}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="complaint-text">{ui.textLabel}</Label>
        <Textarea
          id="complaint-text"
          data-testid="complaint-text"
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

      <PhotoMultiField files={photos} onChange={setPhotos} max={MAX_PHOTOS} label={ui.photosLabel} testId="complaint-photos" />

      <div
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
        data-testid="complaint-video-hint"
      >
        <Video className="size-4 shrink-0" aria-hidden="true" />
        {ui.videoHint}
      </div>

      {serverError && (
        <Notice tone="error" testId="complaint-error">
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId="complaint-saved">
          {ui.saved}
        </Notice>
      )}
      {photoWarning && (
        <Notice tone="warning" testId="complaint-photo-warning">
          {ui.photoNotUploaded}
        </Notice>
      )}

      <Button type="submit" data-testid="complaint-submit" disabled={create.isPending}>
        {create.isPending ? ui.saving : ui.submit}
      </Button>
    </form>
  );
}
