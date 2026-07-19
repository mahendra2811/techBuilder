'use client';

/**
 * People management (Owner + SM + Supervisor — one component, three thin wrappers).
 *   (a) the scoped login list (GET /users) with a deactivate action, and
 *   (b) a cascade-aware "add member" form that creates a labour-master person, an
 *       app login, or both in one flow.
 *
 * The role picker offers only CREATABLE_ROLES[myRole] (mirrors the backend
 * cascade). Placement mirrors the backend scope rule: an SM must attach the new
 * login to one of their own sites; a Supervisor attaches to their OWN crew
 * (crewId pre-filled from /me — there is no crews endpoint, so a crew name
 * cannot be shown or chosen); the Owner may pick any site (optional).
 * New logins always get a generated temp password shown once (backend forces a
 * change on first login).
 *
 * frozen.10 (SM-6) restructure: landing is now section cards → in-page
 * sub-pages (`useSubPage`) for Logins / Add member / Site team ID cards — same
 * pattern as fleet/complaints/settings this round.
 *
 * frozen.11 (SM testing round, part 2) changes:
 * - "Add login" and "Add worker" MERGED into one "Add member" sub-page
 *   (`AddMemberForm`): pick a role first; WORKER/DRIVER show the labour-master
 *   person fields plus a "create app login too?" toggle (default OFF — off
 *   creates only `POST /people`, on also does `POST /users` with the fresh
 *   person linked via `personId`); any other role (staff) keeps the
 *   login-mandatory form as before. A Supervisor never sees the toggle — his
 *   `/people` scope is crew-membership-only (no endpoint exists to add a bare
 *   person to a crew), so a person he creates with no login would be
 *   invisible to him afterward; his flow always creates a login, matching his
 *   pre-merge behavior exactly.
 * - SITE_MANAGER never sees a site picker anywhere in this screen anymore —
 *   he auto-uses his own (single) site from `GET /sites`; OWNER keeps the
 *   optional site picker.
 * - "Labour master (ID cards)" renamed to "Site team ID cards" (the whole
 *   team's cards, not just "labour").
 * - ID-card rows are now clickable → an in-page detail view showing ALL of a
 *   person's data (name — previously not shown at all — skill, mobile,
 *   guardian name, guardian mobile), with the pencil-edit affordance moved
 *   into that detail view. The edit form now also edits the person's NAME
 *   (previously mobile/guardian-only); backend already accepts `name` in
 *   `UpdatePersonInput` under the same OWNER/SM-in-reach-or-creator rule
 *   (`backend/src/people/people.service.ts` `update()` — read-only checked,
 *   not modified here).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { ChevronRight, Pencil } from 'lucide-react';
import { PERSON_SKILLS } from '@techbuilder/contracts';
import type {
  CreatePersonInput,
  CreateUserInput,
  Person,
  PersonSkill,
  Role,
  Site,
  UpdatePersonInput,
  User,
  UUID,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { CREATABLE_ROLES, makeTempPassword } from '@/lib/cascade';
import { apiErrorOf, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { rupeesToPaise } from '@/lib/money';
import { roleHome } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Pill } from '@/components/ui/pill';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { SectionCard } from '@/components/ui/section-card';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { LoadingState, Notice } from '@/components/entry/states';
import { ShowMore } from '@/components/ui/show-more';
import { ResetPasswordAction } from '@/components/people/reset-password-action';

type PeopleRole = 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR';
type PeopleSection = 'logins' | 'addMember' | 'labourMaster';

/** Module-local, bilingual — landing section-card copy only (new; every other
 *  string here still comes from `m.PEOPLE_UI` / `ID_CARD_UI` / `ADD_MEMBER_UI`). */
const LANDING_UI = {
  en: {
    loginsHint: 'Everyone with an app login at your site.',
    labourMasterHint: 'Names, mobiles, and ID-card details.',
  },
  hi: {
    loginsHint: 'आपकी साइट पर ऐप लॉगिन वाले सभी लोग।',
    labourMasterHint: 'नाम, मोबाइल और ID कार्ड जानकारी।',
  },
} as const;

// frozen.11: the merged "Add login" + "Add worker" flow. Module-local (not the shared
// PEOPLE_UI catalog) per this round's file-ownership rule — see header comment.
const ADD_MEMBER_UI = {
  en: {
    cardTitle: 'Add member',
    cardHint: 'Add a worker, driver, or team member — with or without an app login.',
    loginToggleLabel: 'Create app login too?',
    loginToggleHint:
      'Off: added to the labour list only. On: also creates an app login with a one-time temporary password.',
    noSiteWarning: 'Your account has no site assigned yet, so a login cannot be created.',
    submitLabel: 'Add member',
    submitting: 'Saving…',
  },
  hi: {
    cardTitle: 'नया सदस्य',
    cardHint: 'मज़दूर, ड्राइवर या टीम सदस्य जोड़ें — ऐप लॉगिन के साथ या उसके बिना।',
    loginToggleLabel: 'ऐप लॉगिन भी बनाएँ?',
    loginToggleHint: 'बंद: सिर्फ़ मज़दूर लिस्ट में जुड़ेगा। चालू: एक अस्थायी पासवर्ड के साथ ऐप लॉगिन भी बनेगा।',
    noSiteWarning: 'आपके खाते में अभी कोई साइट नहीं जुड़ी है, इसलिए लॉगिन नहीं बनाया जा सकता।',
    submitLabel: 'सदस्य जोड़ें',
    submitting: 'सेव हो रहा है…',
  },
} as const;

// Round 2 (CW-4): ID-card edit affordance — OWNER/SITE_MANAGER only (server enforces the
// same narrow rule; see backend/src/people/people.service.ts `update()`).
// frozen.11: section renamed "Labour master (ID cards)" → "Site team ID cards" (the whole
// team's cards, not just "labour") + rows now open a detail sub-page (see `ui.viewHint`).
const ID_CARD_UI = {
  en: {
    sectionTitle: 'Site team ID cards',
    empty: 'No people yet',
    mobile: 'Mobile',
    guardianName: 'Guardian name',
    guardianPhone: 'Guardian mobile',
    edit: 'Edit ID card',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    saved: 'ID card updated',
    none: 'Not set',
  },
  hi: {
    sectionTitle: 'साइट टीम ID कार्ड',
    empty: 'अभी तक कोई व्यक्ति नहीं',
    mobile: 'मोबाइल',
    guardianName: 'अभिभावक का नाम',
    guardianPhone: 'अभिभावक का मोबाइल',
    edit: 'ID कार्ड संपादित करें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'ID कार्ड अपडेट हो गया',
    none: 'सेट नहीं है',
  },
} as const;
type IdCardUi = UiStrings<typeof ID_CARD_UI>;

export function PeopleScreen({ role }: { role: PeopleRole }) {
  const m = useMessages();
  const locale = useLocale();
  const landing = LANDING_UI[locale];
  const addMemberUi = ADD_MEMBER_UI[locale];
  const idCardUi = ID_CARD_UI[locale];
  const { current: section, open: openSection, close: closeSection } = useSubPage<PeopleSection>();
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  if (section === 'logins') {
    return (
      <div className="grid gap-4" data-testid="people-screen">
        <SubPageHeader title={m.PEOPLE_UI.usersTitle} onBack={closeSection} />
        <UserList role={role} usersQ={usersQ} myUserId={meQ.data?.user.id} />
      </div>
    );
  }

  if (section === 'addMember') {
    return (
      <div className="grid gap-4" data-testid="people-screen">
        <SubPageHeader title={addMemberUi.cardTitle} onBack={closeSection} />
        <AddMemberForm role={role} sites={sitesQ.data} sitesLoading={sitesQ.isPending} myCrewId={meQ.data?.user.crewId ?? null} />
      </div>
    );
  }

  if (section === 'labourMaster') {
    return <PersonIdCardSection role={role} peopleQ={peopleQ} onBack={closeSection} ui={idCardUi} />;
  }

  return (
    <div className="grid gap-4" data-testid="people-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.PEOPLE_UI.title}</CardTitle>
          <CardDescription>{m.PEOPLE_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <SectionCard variant="row" title={m.PEOPLE_UI.usersTitle} subtitle={landing.loginsHint} testId="people-open-logins" onOpen={() => openSection('logins')} />
          <SectionCard variant="row" title={addMemberUi.cardTitle} subtitle={addMemberUi.cardHint} testId="people-open-add-member" onOpen={() => openSection('addMember')} />
          <SectionCard variant="row" title={idCardUi.sectionTitle} subtitle={landing.labourMasterHint} testId="people-open-labour-master" onOpen={() => openSection('labourMaster')} />
        </CardContent>
      </Card>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Labour master (Person) list + ID-card detail + edit (Round 2 / CW-4; frozen.11 detail split)
// ---------------------------------------------------------------------------

/** Owns the list ↔ detail split for the ID-cards sub-page (vendors-screen pattern: track
 *  only the id, re-derive the row from the live query so an edit is reflected immediately). */
function PersonIdCardSection({
  role,
  peopleQ,
  onBack,
  ui,
}: {
  role: PeopleRole;
  peopleQ: UseQueryResult<Person[]>;
  onBack: () => void;
  ui: IdCardUi;
}) {
  const [selectedId, setSelectedId] = useState<UUID | null>(null);
  const selected = selectedId ? (peopleQ.data?.find((p) => p.id === selectedId) ?? null) : null;

  if (selectedId) {
    return (
      <div className="grid gap-4" data-testid="people-screen">
        <SubPageHeader title={selected?.name ?? ui.sectionTitle} onBack={() => setSelectedId(null)} />
        {selected ? (
          <PersonIdCardDetail person={selected} role={role} ui={ui} />
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="people-screen">
      <SubPageHeader title={ui.sectionTitle} onBack={onBack} />
      <PersonList peopleQ={peopleQ} ui={ui} onSelect={setSelectedId} />
    </div>
  );
}

function PersonList({
  peopleQ,
  ui,
  onSelect,
}: {
  peopleQ: UseQueryResult<Person[]>;
  ui: IdCardUi;
  onSelect: (id: UUID) => void;
}) {
  const m = useMessages();

  return (
    <Card data-testid="person-list">
      <CardHeader>
        <CardTitle>{ui.sectionTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <QueryBoundary query={peopleQ} emptyLabel={ui.empty}>
          {(people) => (
          <ShowMore
            items={people}
            initial={10}
            as="ul"
            className="divide-y"
            testIdPrefix="person-list"
            renderItem={(person) => (
              <li key={person.id} className="first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-accent"
                  data-testid={`person-row-${person.id}`}
                  onClick={() => onSelect(person.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.skill ? m.PERSON_SKILL_LABELS[person.skill] : ui.none} ·{' '}
                      {ui.mobile}: {person.phone ?? ui.none}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            )}
          />
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

/** frozen.11: read-only card for ALL of a person's ID-card data (name — previously not
 *  shown anywhere — skill, mobile, guardian name, guardian mobile), with the pencil-edit
 *  affordance (OWNER/SITE_MANAGER only) now living here instead of inline in the list row. */
function PersonIdCardDetail({ person, role, ui }: { person: Person; role: PeopleRole; ui: IdCardUi }) {
  const m = useMessages();
  const canEdit = role === 'OWNER' || role === 'SITE_MANAGER';
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <PersonIdCardEditForm person={person} ui={ui} onDone={() => setEditing(false)} />;
  }

  return (
    <Card data-testid={`person-detail-${person.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{person.name}</CardTitle>
          {canEdit && (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={ui.edit}
              data-testid={`person-edit-toggle-${person.id}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-1">
        <DetailRow label={m.PEOPLE_UI.name} value={person.name} testId={`person-detail-name-${person.id}`} />
        <DetailRow
          label={m.PEOPLE_UI.skill}
          value={person.skill ? m.PERSON_SKILL_LABELS[person.skill] : ui.none}
          testId={`person-detail-skill-${person.id}`}
        />
        <DetailRow label={ui.mobile} value={person.phone ?? ui.none} testId={`person-detail-mobile-${person.id}`} />
        <DetailRow
          label={ui.guardianName}
          value={person.guardianName ?? ui.none}
          testId={`person-detail-guardian-name-${person.id}`}
        />
        <DetailRow
          label={ui.guardianPhone}
          value={person.guardianPhone ?? ui.none}
          testId={`person-detail-guardian-phone-${person.id}`}
        />
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-input/50 py-2 last:border-0" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

function PersonIdCardEditForm({
  person,
  ui,
  onDone,
}: {
  person: Person;
  ui: IdCardUi;
  onDone: () => void;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? '');
  const [guardianName, setGuardianName] = useState(person.guardianName ?? '');
  const [guardianPhone, setGuardianPhone] = useState(person.guardianPhone ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (input: UpdatePersonInput) => api<Person>('PATCH', `/people/${person.id}`, input),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  const serverError =
    apiErrorOf(m, save.error);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) {
      setNameError(m.PEOPLE_UI.nameRequired);
      return;
    }
    setNameError(null);
    save.mutate({
      name: name.trim(),
      phone: phone.trim(),
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim(),
    });
  };

  return (
    <form
      className="grid gap-4 rounded-lg border border-input p-3"
      noValidate
      onSubmit={onSubmit}
      data-testid={`person-edit-form-${person.id}`}
    >
      <div className="grid gap-2">
        <Label htmlFor={`person-edit-name-${person.id}`}>{m.PEOPLE_UI.name}</Label>
        <Input
          id={`person-edit-name-${person.id}`}
          data-testid={`person-edit-name-${person.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {nameError && <p className="text-sm text-destructive" role="alert">{nameError}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`person-edit-phone-${person.id}`}>{ui.mobile}</Label>
        <Input
          id={`person-edit-phone-${person.id}`}
          type="tel"
          inputMode="tel"
          data-testid={`person-edit-phone-${person.id}`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`person-edit-guardian-name-${person.id}`}>{ui.guardianName}</Label>
        <Input
          id={`person-edit-guardian-name-${person.id}`}
          data-testid={`person-edit-guardian-name-${person.id}`}
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`person-edit-guardian-phone-${person.id}`}>{ui.guardianPhone}</Label>
        <Input
          id={`person-edit-guardian-phone-${person.id}`}
          type="tel"
          inputMode="tel"
          data-testid={`person-edit-guardian-phone-${person.id}`}
          value={guardianPhone}
          onChange={(e) => setGuardianPhone(e.target.value)}
        />
      </div>
      {serverError && (
        <Notice tone="error" testId={`person-edit-error-${person.id}`}>
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId={`person-edit-success-${person.id}`}>
          {ui.saved}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" data-testid={`person-edit-save-${person.id}`} disabled={save.isPending}>
          {save.isPending ? ui.saving : ui.save}
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid={`person-edit-cancel-${person.id}`} onClick={onDone}>
          {ui.cancel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// (a) User list + deactivate
// ---------------------------------------------------------------------------

function UserList({
  role,
  usersQ,
  myUserId,
}: {
  role: PeopleRole;
  usersQ: UseQueryResult<User[]>;
  myUserId: UUID | undefined;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<UUID | null>(null);
  const [confirmingActivateId, setConfirmingActivateId] = useState<UUID | null>(null);
  const [showResetFor, setShowResetFor] = useState<UUID | null>(null);

  const deactivate = useMutation({
    mutationFn: (id: UUID) => api<{ ok: true }>('POST', `/users/${id}/deactivate`),
    onSuccess: () => {
      setConfirmingId(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // WO-8 (wave 2): Owner only — reactivating is a trust decision, unlike deactivate.
  const activate = useMutation({
    mutationFn: (id: UUID) => api<{ ok: true }>('POST', `/users/${id}/activate`),
    onSuccess: () => {
      setConfirmingActivateId(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const creatable = CREATABLE_ROLES[role];
  // Client-plan T-5: a Supervisor creates people but never deactivates — SM-and-above only
  // (server hard-blocks it too; hiding the button avoids a dead affordance).
  const canDeactivate = (u: User) =>
    role !== 'SUPERVISOR' && u.active && u.id !== myUserId && creatable.includes(u.role);
  const canActivate = (u: User) => role === 'OWNER' && !u.active && u.id !== myUserId;
  // Mirrors backend resetPassword scope: Owner any, SM only roles they may create
  // (the users list is already scope-filtered server-side, so presence ⟺ in-scope).
  const canResetPassword = (u: User) => role !== 'SUPERVISOR' && u.id !== myUserId && (role === 'OWNER' || creatable.includes(u.role));

  const errorMessage = (err: unknown): string | null =>
    apiErrorOf(m, err);
  const serverError = errorMessage(deactivate.error) ?? errorMessage(activate.error);

  return (
    <Card data-testid="user-list">
      <CardHeader>
        <CardTitle>{m.PEOPLE_UI.usersTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <QueryBoundary query={usersQ} emptyLabel={m.PEOPLE_UI.usersEmpty}>
          {(users) => (
          <ShowMore
            items={users}
            initial={10}
            as="ul"
            className="divide-y"
            testIdPrefix="user-list"
            renderItem={(u) => {
              const busy = deactivate.isPending && deactivate.variables === u.id;
              const activating = activate.isPending && activate.variables === u.id;
              return (
                <li key={u.id} className="grid gap-2 py-3 first:pt-0 last:pb-0" data-testid={`user-row-${u.id}`}>
                  <div className="flex items-center gap-3">
                    {/* WO-13 drill-down — Round 2: person insights are SM/Owner-only now, so the
                        SUPERVISOR row is plain text (no link to a FORBIDDEN page). */}
                    {role === 'SUPERVISOR' ? (
                      <div data-testid={`user-row-link-${u.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.username} · {m.ROLE_LABELS[u.role]}
                          {u.phone && ` · ${u.phone}`}
                        </p>
                      </div>
                    ) : (
                      <Link href={`${roleHome(role)}/people/${u.id}`} data-testid={`user-row-link-${u.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.username} · {m.ROLE_LABELS[u.role]}
                          {u.phone && ` · ${u.phone}`}
                        </p>
                      </Link>
                    )}
                    <Pill tone={u.active ? 'success' : 'neutral'}>
                      {u.active ? m.PEOPLE_UI.activeYes : m.PEOPLE_UI.activeNo}
                    </Pill>
                  </div>
                  {(canDeactivate(u) || canActivate(u) || canResetPassword(u)) && (
                    <div className="flex flex-wrap gap-2">
                      {canDeactivate(u) && (
                        <Button
                          type="button"
                          size="sm"
                          variant={confirmingId === u.id ? 'destructive' : 'outline'}
                          data-testid={`user-deactivate-${u.id}`}
                          disabled={busy}
                          onClick={() => {
                            if (confirmingId === u.id) deactivate.mutate(u.id);
                            else setConfirmingId(u.id);
                          }}
                        >
                          {busy ? m.PEOPLE_UI.deactivating : confirmingId === u.id ? m.PEOPLE_UI.deactivateConfirm : m.PEOPLE_UI.deactivate}
                        </Button>
                      )}
                      {canActivate(u) && (
                        <Button
                          type="button"
                          size="sm"
                          variant={confirmingActivateId === u.id ? 'default' : 'outline'}
                          data-testid={`user-activate-${u.id}`}
                          disabled={activating}
                          onClick={() => {
                            if (confirmingActivateId === u.id) activate.mutate(u.id);
                            else setConfirmingActivateId(u.id);
                          }}
                        >
                          {activating
                            ? m.PEOPLE_UI.activating
                            : confirmingActivateId === u.id
                              ? m.PEOPLE_UI.activateConfirm
                              : m.PEOPLE_UI.activate}
                        </Button>
                      )}
                      {canResetPassword(u) && showResetFor !== u.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`user-reset-password-toggle-${u.id}`}
                          onClick={() => setShowResetFor(u.id)}
                        >
                          {m.PEOPLE_UI.resetPassword}
                        </Button>
                      )}
                    </div>
                  )}
                  {showResetFor === u.id && <ResetPasswordAction userId={u.id} testIdPrefix={`user-reset-password-${u.id}`} />}
                </li>
              );
            }}
          />
          )}
        </QueryBoundary>
        {serverError && (
          <Notice tone="error" testId="user-deactivate-error">
            {serverError}
          </Notice>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (b) Add member — merged "create login" + "create worker" (frozen.11)
// ---------------------------------------------------------------------------

/** The three ways this form can submit, and what each does server-side. */
type AddMemberPayload =
  | { kind: 'personOnly'; person: CreatePersonInput }
  | { kind: 'personAndLogin'; person: CreatePersonInput; user: CreateUserInput }
  | { kind: 'loginOnly'; user: CreateUserInput };

function AddMemberForm({
  role,
  sites,
  sitesLoading,
  myCrewId,
}: {
  role: PeopleRole;
  sites: Site[] | undefined;
  sitesLoading: boolean;
  myCrewId: UUID | null;
}) {
  const m = useMessages();
  const locale = useLocale();
  const ui = ADD_MEMBER_UI[locale];
  const queryClient = useQueryClient();

  const creatable = CREATABLE_ROLES[role];
  const [targetRole, setTargetRole] = useState<Role>(creatable[0]!);
  const isPersonRole = targetRole === 'WORKER' || targetRole === 'DRIVER';
  const isSupervisorCaller = role === 'SUPERVISOR';
  // A Supervisor's /people scope only ever includes his crew's members (there is no endpoint
  // to add a bare person to a crew) — a person he creates with the login OFF would be
  // invisible to him afterward. His pre-merge flow always created a login, so we keep that
  // exactly: no toggle shown, login always created.
  const loginToggleAvailable = isPersonRole && !isSupervisorCaller;
  const [createLoginToggle, setCreateLoginToggle] = useState(false);
  const willCreateLogin = !isPersonRole || isSupervisorCaller || createLoginToggle;

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [skill, setSkill] = useState<PersonSkill | ''>('');
  const [wageRupees, setWageRupees] = useState('');
  const [assignedSiteId, setAssignedSiteId] = useState<UUID | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);
  const [personOnlySaved, setPersonOnlySaved] = useState(false);

  // A Supervisor creates inside their own crew — blocked entirely if they have none (unchanged
  // from the pre-merge login form's behavior).
  const thBlocked = isSupervisorCaller && !myCrewId;
  // Site select: OWNER only, and only when a login will actually exist (Person has no site
  // field). SITE_MANAGER never sees a picker — auto-uses his own (single) site.
  const showOwnerSiteSelect = role === 'OWNER' && willCreateLogin;
  const smSiteId = sites?.[0]?.id;
  const smNeedsSiteButHasNone = role === 'SITE_MANAGER' && willCreateLogin && !sitesLoading && !smSiteId;

  const submit = useMutation({
    mutationFn: async (payload: AddMemberPayload) => {
      if (payload.kind === 'personOnly') {
        const person = await api<Person>('POST', '/people', payload.person);
        return { kind: 'personOnly' as const, person };
      }
      if (payload.kind === 'personAndLogin') {
        const person = await api<Person>('POST', '/people', payload.person);
        const user = await api<User>('POST', '/users', { ...payload.user, personId: person.id });
        return { kind: 'personAndLogin' as const, person, user, tempPassword: payload.user.tempPassword };
      }
      const user = await api<User>('POST', '/users', payload.user);
      return { kind: 'loginOnly' as const, user, tempPassword: payload.user.tempPassword };
    },
    onSuccess: (result) => {
      if (result.kind === 'personOnly') {
        setPersonOnlySaved(true);
        setCreated(null);
      } else {
        setCreated({ username: result.user.username, tempPassword: result.tempPassword });
        setPersonOnlySaved(false);
      }
      setName('');
      setUsername('');
      setPhone('');
      setSkill('');
      setWageRupees('');
      setAssignedSiteId('');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      if (result.kind !== 'personOnly') void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      setCreated(null);
      setPersonOnlySaved(false);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreated(null);
    setPersonOnlySaved(false);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = m.PEOPLE_UI.nameRequired;
    if (willCreateLogin && !username.trim()) errs.username = m.PEOPLE_UI.usernameRequired;
    if (smNeedsSiteButHasNone) errs.site = ui.noSiteWarning;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const resolvedSiteId: UUID | undefined =
      role === 'OWNER' ? (assignedSiteId || undefined) : role === 'SITE_MANAGER' ? smSiteId : undefined;
    const wage = Number(wageRupees);

    if (isPersonRole) {
      const personInput: CreatePersonInput = {
        id: uuidv7(),
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(skill ? { skill } : {}),
        ...(wageRupees.trim() && Number.isFinite(wage) && wage > 0 ? { defaultWagePaise: rupeesToPaise(wage) } : {}),
        // frozen.12: place the person on the resolved site (Owner's pick / SM's own site); the
        // server forces the creator's own site for non-Owners regardless, so this is just intent.
        ...(resolvedSiteId ? { siteId: resolvedSiteId } : {}),
      };
      if (willCreateLogin) {
        const userInput: CreateUserInput = {
          id: uuidv7(),
          name: name.trim(),
          username: username.trim(),
          role: targetRole,
          tempPassword: makeTempPassword(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(resolvedSiteId ? { assignedSiteId: resolvedSiteId } : {}),
          ...(isSupervisorCaller && myCrewId ? { crewId: myCrewId } : {}),
        };
        submit.mutate({ kind: 'personAndLogin', person: personInput, user: userInput });
      } else {
        submit.mutate({ kind: 'personOnly', person: personInput });
      }
    } else {
      const userInput: CreateUserInput = {
        id: uuidv7(),
        name: name.trim(),
        username: username.trim(),
        role: targetRole,
        tempPassword: makeTempPassword(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(resolvedSiteId ? { assignedSiteId: resolvedSiteId } : {}),
      };
      submit.mutate({ kind: 'loginOnly', user: userInput });
    }
  };

  // Surface DUPLICATE (username taken) inline; everything else via the catalog.
  const dupUsername =
    submit.error instanceof ApiClientError && (submit.error.code === 'DUPLICATE' || submit.error.fields?.username);
  const serverError = dupUsername ? null : apiErrorOf(m, submit.error);

  return (
    <Card data-testid="people-sub-add-member">
      <CardHeader>
        <CardTitle>{ui.cardTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {thBlocked ? (
          <Notice tone="warning" testId="add-member-no-crew">
            {m.PEOPLE_UI.noCrewWarning}
          </Notice>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="member-role">{m.PEOPLE_UI.roleLabel}</Label>
              <NativeSelect
                id="member-role"
                data-testid="member-role"
                value={targetRole}
                onChange={(e) => {
                  setTargetRole(e.target.value as Role);
                  setErrors({});
                  setCreated(null);
                  setPersonOnlySaved(false);
                }}
              >
                {creatable.map((r) => (
                  <option key={r} value={r}>
                    {m.ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-name">{isPersonRole ? m.PEOPLE_UI.personName : m.PEOPLE_UI.name}</Label>
              <Input id="member-name" data-testid="member-name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-sm text-destructive" role="alert">{errors.name}</p>}
            </div>

            {isPersonRole && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="member-skill">{m.PEOPLE_UI.skill}</Label>
                  <NativeSelect
                    id="member-skill"
                    data-testid="member-skill"
                    value={skill}
                    onChange={(e) => setSkill(e.target.value as PersonSkill | '')}
                  >
                    <option value="">{m.PEOPLE_UI.none}</option>
                    {PERSON_SKILLS.map((s) => (
                      <option key={s} value={s}>
                        {m.PERSON_SKILL_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="member-wage">{m.PEOPLE_UI.defaultWage}</Label>
                  <Input
                    id="member-wage"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    data-testid="member-wage"
                    value={wageRupees}
                    onChange={(e) => setWageRupees(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="member-phone">{m.PEOPLE_UI.phone}</Label>
              <Input
                id="member-phone"
                type="tel"
                inputMode="tel"
                data-testid="member-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {loginToggleAvailable && (
              <div className="flex items-start gap-2.5 rounded-lg border border-input p-3">
                <Checkbox
                  id="member-create-login"
                  data-testid="member-create-login"
                  checked={createLoginToggle}
                  onCheckedChange={(checked) => setCreateLoginToggle(checked)}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="member-create-login" className="cursor-pointer text-sm font-normal">
                    {ui.loginToggleLabel}
                  </Label>
                  <p className="text-xs text-muted-foreground">{ui.loginToggleHint}</p>
                </div>
              </div>
            )}

            {isSupervisorCaller && isPersonRole && (
              <p className="text-xs text-muted-foreground" data-testid="add-member-crew-note">
                {m.PEOPLE_UI.crewPrefillNote}
              </p>
            )}

            {targetRole === 'SUPERVISOR' && (
              <p className="text-xs text-muted-foreground" data-testid="create-th-note">{m.PEOPLE_UI.noCrewNote}</p>
            )}

            {willCreateLogin && (
              <div className="grid gap-2">
                <Label htmlFor="member-username">{m.PEOPLE_UI.username}</Label>
                <Input
                  id="member-username"
                  data-testid="member-username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                {errors.username && <p className="text-sm text-destructive" role="alert">{errors.username}</p>}
                {dupUsername && (
                  <p className="text-sm text-destructive" role="alert" data-testid="member-username-taken">
                    {m.PEOPLE_UI.usernameTaken}
                  </p>
                )}
              </div>
            )}

            {showOwnerSiteSelect && (
              <div className="grid gap-2">
                <Label htmlFor="member-site">{m.PEOPLE_UI.site}</Label>
                {sitesLoading ? (
                  <LoadingState />
                ) : (
                  <NativeSelect
                    id="member-site"
                    data-testid="member-site"
                    value={assignedSiteId}
                    onChange={(e) => setAssignedSiteId(e.target.value)}
                  >
                    <option value="">{m.PEOPLE_UI.none}</option>
                    {(sites ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            )}

            {errors.site && (
              <Notice tone="warning" testId="add-member-site-warning">
                {errors.site}
              </Notice>
            )}

            {serverError && (
              <Notice tone="error" testId="add-member-error">
                {serverError}
              </Notice>
            )}
            {created && (
              <Notice tone="success" testId="add-member-login-success">
                {m.PEOPLE_UI.userCreatedNotice} {m.PEOPLE_UI.username}: <strong>{created.username}</strong> ·{' '}
                {m.PEOPLE_UI.tempPasswordLabel}: <strong data-testid="created-temp-password">{created.tempPassword}</strong>
                <br />
                {m.PEOPLE_UI.tempPasswordHint}
              </Notice>
            )}
            {personOnlySaved && (
              <Notice tone="success" testId="add-member-person-success">
                {m.PEOPLE_UI.personCreatedNotice}
              </Notice>
            )}

            <Button type="submit" data-testid="member-submit" disabled={submit.isPending}>
              {submit.isPending ? ui.submitting : ui.submitLabel}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
