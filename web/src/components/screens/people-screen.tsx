'use client';

/**
 * People management (Owner + SM + Supervisor — one component, three thin wrappers).
 *   (a) the scoped login list (GET /users) with a deactivate action, and
 *   (b) a cascade-aware "create login" form, plus (Owner/SM) a "create worker"
 *       (labour master) form.
 *
 * The role picker offers only CREATABLE_ROLES[myRole] (mirrors the backend
 * cascade). Placement mirrors the backend scope rule: an SM must attach the new
 * login to one of their own sites (site picker, required); a TH attaches to
 * their OWN crew (crewId pre-filled from /me — there is no crews endpoint, so a
 * crew name cannot be shown or chosen); the Owner may pick any site (optional).
 * New logins always get a generated temp password shown once (backend forces a
 * change on first login).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { Pencil } from 'lucide-react';
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
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { rupeesToPaise } from '@/lib/money';
import { roleHome } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { ShowMore } from '@/components/ui/show-more';
import { ResetPasswordAction } from '@/components/people/reset-password-action';

type PeopleRole = 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR';

// Round 2 (CW-4): ID-card edit affordance — OWNER/SITE_MANAGER only (server enforces the
// same narrow rule; see backend/src/people/people.service.ts `update()`).
const ID_CARD_UI = {
  en: {
    sectionTitle: 'Labour master (ID cards)',
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
    sectionTitle: 'मज़दूर सूची (ID कार्ड)',
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
// Widened (plain `string` fields): `ID_CARD_UI[locale]` (locale: 'en' | 'hi') resolves to
// the UNION of both branches' literal-object types, which isn't assignable to either
// branch alone — components receiving it as a prop need this wider, non-literal shape.
type IdCardUi = { [K in keyof (typeof ID_CARD_UI)['en']]: string };

export function PeopleScreen({ role }: { role: PeopleRole }) {
  const m = useMessages();
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  return (
    <div className="grid gap-4" data-testid="people-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.PEOPLE_UI.title}</CardTitle>
          <CardDescription>{m.PEOPLE_UI.subtitle}</CardDescription>
        </CardHeader>
      </Card>

      <UserList role={role} usersQ={usersQ} myUserId={meQ.data?.user.id} />

      <CreateUserForm
        role={role}
        sites={sitesQ.data}
        sitesLoading={sitesQ.isPending}
        people={peopleQ.data ?? []}
        myCrewId={meQ.data?.user.crewId ?? null}
      />

      {(role === 'OWNER' || role === 'SITE_MANAGER') && <CreatePersonForm />}

      <PersonList role={role} peopleQ={peopleQ} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labour master (Person) list + ID-card edit (Round 2 / CW-4)
// ---------------------------------------------------------------------------

function PersonList({ role, peopleQ }: { role: PeopleRole; peopleQ: UseQueryResult<Person[]> }) {
  const m = useMessages();
  const locale = useLocale();
  const ui = ID_CARD_UI[locale];
  const canEditIdCard = role === 'OWNER' || role === 'SITE_MANAGER';
  const [editingId, setEditingId] = useState<UUID | null>(null);

  return (
    <Card data-testid="person-list">
      <CardHeader>
        <CardTitle>{ui.sectionTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {peopleQ.isPending ? (
          <LoadingState />
        ) : peopleQ.error ? (
          <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
        ) : !peopleQ.data || peopleQ.data.length === 0 ? (
          <EmptyState label={ui.empty} />
        ) : (
          <ShowMore
            items={peopleQ.data}
            initial={10}
            as="ul"
            className="divide-y"
            testIdPrefix="person-list"
            renderItem={(person) => (
              <li key={person.id} className="grid gap-2 py-3 first:pt-0 last:pb-0" data-testid={`person-row-${person.id}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.skill ? m.PERSON_SKILL_LABELS[person.skill] : ui.none} ·{' '}
                      {ui.mobile}: {person.phone ?? ui.none}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" data-testid={`person-row-guardian-${person.id}`}>
                      {ui.guardianName}: {person.guardianName ?? ui.none} · {ui.guardianPhone}: {person.guardianPhone ?? ui.none}
                    </p>
                  </div>
                  {canEditIdCard && editingId !== person.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`person-edit-toggle-${person.id}`}
                      onClick={() => setEditingId(person.id)}
                    >
                      <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                      {ui.edit}
                    </Button>
                  )}
                </div>
                {canEditIdCard && editingId === person.id && (
                  <PersonIdCardEditForm person={person} ui={ui} onDone={() => setEditingId(null)} />
                )}
              </li>
            )}
          />
        )}
      </CardContent>
    </Card>
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
  const [phone, setPhone] = useState(person.phone ?? '');
  const [guardianName, setGuardianName] = useState(person.guardianName ?? '');
  const [guardianPhone, setGuardianPhone] = useState(person.guardianPhone ?? '');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (input: UpdatePersonInput) => api<Person>('PATCH', `/people/${person.id}`, input),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  const serverError =
    save.error instanceof ApiClientError ? apiErrorMessage(m, save.error.code) : save.error ? apiErrorMessage(m) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    save.mutate({
      phone: phone.trim(),
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim(),
    });
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-input p-3"
      noValidate
      onSubmit={onSubmit}
      data-testid={`person-edit-form-${person.id}`}
    >
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
    err instanceof ApiClientError ? apiErrorMessage(m, err.code) : err ? apiErrorMessage(m) : null;
  const serverError = errorMessage(deactivate.error) ?? errorMessage(activate.error);

  return (
    <Card data-testid="user-list">
      <CardHeader>
        <CardTitle>{m.PEOPLE_UI.usersTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {usersQ.isPending ? (
          <LoadingState />
        ) : usersQ.error ? (
          <ErrorState error={usersQ.error} onRetry={() => void usersQ.refetch()} />
        ) : !usersQ.data || usersQ.data.length === 0 ? (
          <EmptyState label={m.PEOPLE_UI.usersEmpty} />
        ) : (
          <ShowMore
            items={usersQ.data}
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
                        </p>
                      </div>
                    ) : (
                      <Link href={`${roleHome(role)}/people/${u.id}`} data-testid={`user-row-link-${u.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.username} · {m.ROLE_LABELS[u.role]}
                        </p>
                      </Link>
                    )}
                    <span
                      className={
                        u.active
                          ? 'shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400'
                          : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground'
                      }
                    >
                      {u.active ? m.PEOPLE_UI.activeYes : m.PEOPLE_UI.activeNo}
                    </span>
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
// (b) Create login (cascade-aware)
// ---------------------------------------------------------------------------

function CreateUserForm({
  role,
  sites,
  sitesLoading,
  people,
  myCrewId,
}: {
  role: PeopleRole;
  sites: Site[] | undefined;
  sitesLoading: boolean;
  people: Person[];
  myCrewId: UUID | null;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();

  const creatable = CREATABLE_ROLES[role];
  const [targetRole, setTargetRole] = useState<Role>(creatable[0]!);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedSiteId, setAssignedSiteId] = useState<UUID | ''>('');
  const [linkPersonId, setLinkPersonId] = useState<UUID | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);

  const showSite = role === 'OWNER' || role === 'SITE_MANAGER';
  const siteRequired = role === 'SITE_MANAGER';
  const showPersonLink = targetRole === 'WORKER' || targetRole === 'DRIVER';
  // A Supervisor creates inside their own crew — blocked entirely if they have none.
  const thBlocked = role === 'SUPERVISOR' && !myCrewId;

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => api<User>('POST', '/users', input),
    onSuccess: (_user, input) => {
      setCreated({ username: input.username, tempPassword: input.tempPassword });
      setName('');
      setUsername('');
      setPhone('');
      setAssignedSiteId('');
      setLinkPersonId('');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => setCreated(null),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreated(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = m.PEOPLE_UI.nameRequired;
    if (!username.trim()) errs.username = m.PEOPLE_UI.usernameRequired;
    if (siteRequired && !assignedSiteId) errs.site = m.PEOPLE_UI.siteRequired;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const input: CreateUserInput = {
      id: uuidv7(),
      name: name.trim(),
      username: username.trim(),
      role: targetRole,
      tempPassword: makeTempPassword(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(assignedSiteId ? { assignedSiteId } : {}),
      ...(role === 'SUPERVISOR' && myCrewId ? { crewId: myCrewId } : {}),
      ...(showPersonLink && linkPersonId ? { personId: linkPersonId } : {}),
    };
    create.mutate(input);
  };

  // Surface DUPLICATE (username taken) inline; everything else via the catalog.
  const dupUsername =
    create.error instanceof ApiClientError && (create.error.code === 'DUPLICATE' || create.error.fields?.username);
  const serverError =
    !dupUsername && create.error instanceof ApiClientError
      ? apiErrorMessage(m, create.error.code)
      : !dupUsername && create.error
        ? apiErrorMessage(m)
        : null;

  return (
    <Card data-testid="create-user">
      <CardHeader>
        <CardTitle>{m.PEOPLE_UI.createUserTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {thBlocked ? (
          <Notice tone="warning" testId="create-user-no-crew">
            {m.PEOPLE_UI.noCrewWarning}
          </Notice>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="user-role">{m.PEOPLE_UI.roleLabel}</Label>
              <NativeSelect
                id="user-role"
                data-testid="user-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as Role)}
              >
                {creatable.map((r) => (
                  <option key={r} value={r}>
                    {m.ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-name">{m.PEOPLE_UI.name}</Label>
              <Input id="user-name" data-testid="user-name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-sm text-destructive" role="alert">{errors.name}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-username">{m.PEOPLE_UI.username}</Label>
              <Input
                id="user-username"
                data-testid="user-username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              {errors.username && <p className="text-sm text-destructive" role="alert">{errors.username}</p>}
              {dupUsername && (
                <p className="text-sm text-destructive" role="alert" data-testid="user-username-taken">
                  {m.PEOPLE_UI.usernameTaken}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-phone">{m.PEOPLE_UI.phone}</Label>
              <Input id="user-phone" type="tel" inputMode="tel" data-testid="user-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            {showSite && (
              <div className="grid gap-2">
                <Label htmlFor="user-site">{m.PEOPLE_UI.site}</Label>
                {sitesLoading ? (
                  <LoadingState />
                ) : (
                  <NativeSelect
                    id="user-site"
                    data-testid="user-site"
                    value={assignedSiteId}
                    onChange={(e) => setAssignedSiteId(e.target.value)}
                  >
                    <option value="">{siteRequired ? m.PEOPLE_UI.selectSite : m.PEOPLE_UI.none}</option>
                    {(sites ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {errors.site && <p className="text-sm text-destructive" role="alert">{errors.site}</p>}
                {targetRole === 'SUPERVISOR' && (
                  <p className="text-xs text-muted-foreground" data-testid="create-th-note">{m.PEOPLE_UI.noCrewNote}</p>
                )}
              </div>
            )}

            {role === 'SUPERVISOR' && (
              <p className="text-xs text-muted-foreground" data-testid="create-crew-note">{m.PEOPLE_UI.crewPrefillNote}</p>
            )}

            {showPersonLink && (
              <div className="grid gap-2">
                <Label htmlFor="user-person">{m.PEOPLE_UI.linkPerson}</Label>
                <NativeSelect
                  id="user-person"
                  data-testid="user-person"
                  value={linkPersonId}
                  onChange={(e) => setLinkPersonId(e.target.value)}
                >
                  <option value="">{m.PEOPLE_UI.none}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {serverError && (
              <Notice tone="error" testId="create-user-error">
                {serverError}
              </Notice>
            )}
            {created && (
              <Notice tone="success" testId="create-user-success">
                {m.PEOPLE_UI.userCreatedNotice} {m.PEOPLE_UI.username}: <strong>{created.username}</strong> ·{' '}
                {m.PEOPLE_UI.tempPasswordLabel}: <strong data-testid="created-temp-password">{created.tempPassword}</strong>
                <br />
                {m.PEOPLE_UI.tempPasswordHint}
              </Notice>
            )}

            <Button type="submit" data-testid="create-user-submit" disabled={create.isPending}>
              {create.isPending ? m.PEOPLE_UI.creatingUser : m.PEOPLE_UI.createUserSubmit}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create Person (labour master) — Owner + SM
// ---------------------------------------------------------------------------

function CreatePersonForm() {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [skill, setSkill] = useState<PersonSkill | ''>('');
  const [phone, setPhone] = useState('');
  const [wageRupees, setWageRupees] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreatePersonInput) => api<Person>('POST', '/people', input),
    onSuccess: () => {
      setSaved(true);
      setName('');
      setSkill('');
      setPhone('');
      setWageRupees('');
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) {
      setNameError(m.PEOPLE_UI.nameRequired);
      return;
    }
    setNameError(null);
    const wage = Number(wageRupees);
    const input: CreatePersonInput = {
      id: uuidv7(),
      name: name.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(skill ? { skill } : {}),
      ...(wageRupees.trim() && Number.isFinite(wage) && wage > 0 ? { defaultWagePaise: rupeesToPaise(wage) } : {}),
    };
    create.mutate(input);
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="create-person">
      <CardHeader>
        <CardTitle>{m.PEOPLE_UI.createPersonTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="person-name">{m.PEOPLE_UI.personName}</Label>
            <Input id="person-name" data-testid="person-name" value={name} onChange={(e) => setName(e.target.value)} />
            {nameError && <p className="text-sm text-destructive" role="alert">{nameError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="person-skill">{m.PEOPLE_UI.skill}</Label>
              <NativeSelect
                id="person-skill"
                data-testid="person-skill"
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
              <Label htmlFor="person-wage">{m.PEOPLE_UI.defaultWage}</Label>
              <Input
                id="person-wage"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="person-wage"
                value={wageRupees}
                onChange={(e) => setWageRupees(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="person-phone">{m.PEOPLE_UI.phone}</Label>
            <Input id="person-phone" type="tel" inputMode="tel" data-testid="person-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="create-person-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-person-success">
              {m.PEOPLE_UI.personCreatedNotice}
            </Notice>
          )}

          <Button type="submit" data-testid="create-person-submit" disabled={create.isPending}>
            {create.isPending ? m.PEOPLE_UI.creatingPerson : m.PEOPLE_UI.createPersonSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
