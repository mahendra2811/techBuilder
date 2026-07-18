'use client';

/**
 * Login page — react-hook-form + zod (form-shape only; LoginInput's deviceId is
 * added server-side by the login Route Handler). On success routes by role, via
 * the change-password gate when the backend flags mustChangePassword.
 */
import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, login } from '@/lib/api-client';
import { authErrorMessage, type Messages } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { roleHome } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocaleToggle } from '@/components/locale-toggle';

const makeLoginFormSchema = (f: Messages['FORM_MESSAGES']) =>
  z.object({
    username: z.string().min(1, f.usernameRequired),
    password: z.string().min(1, f.passwordRequired),
  });
type LoginForm = z.infer<ReturnType<typeof makeLoginFormSchema>>;

/**
 * DEV ONLY — seeded test credentials shown on the login screen for fast role
 * switching during development. REMOVE this block (and its render section
 * below) before any pilot/production build. Matches backend/merchants/dev/.
 */
const DEV_PASSWORD = 'changeme123';
/**
 * Full devco roster (per backend/scripts/backfill-frozen10.ts): 2 sites —
 * Greenfield Residency ("GF") and Sunrise Towers ("ST") — each with its own
 * Site Manager + Accountant + 2 Supervisors; drivers/workers spread across
 * both sites' crews. One shared dev password for every login. Grouped by
 * role for the tap panel below.
 */
const DEV_LOGIN_GROUPS: Array<{ group: string; logins: Array<{ username: string; label: string }> }> = [
  { group: 'Owner', logins: [{ username: 'owner', label: 'Owner' }] },
  {
    group: 'Site Managers',
    logins: [
      { username: 'sm1', label: 'Site Manager — GF' },
      { username: 'sm2', label: 'Site Manager — ST' },
    ],
  },
  {
    group: 'Accountants',
    logins: [
      { username: 'acct1', label: 'Accountant — GF' },
      { username: 'acct2', label: 'Accountant — ST' },
    ],
  },
  {
    group: 'Supervisors',
    logins: [
      { username: 'th1', label: 'Supervisor — GF (1)' },
      { username: 'th2', label: 'Supervisor — ST (1)' },
      { username: 'th3', label: 'Supervisor — GF (2)' },
      { username: 'th4', label: 'Supervisor — ST (2)' },
    ],
  },
  {
    group: 'Drivers',
    logins: [
      { username: 'driver1', label: 'Driver — GF (1)' },
      { username: 'driver2', label: 'Driver — GF (2)' },
      { username: 'driver3', label: 'Driver — ST (1)' },
      { username: 'driver4', label: 'Driver — ST (2)' },
    ],
  },
  {
    group: 'Workers',
    logins: [
      { username: 'worker1', label: 'Worker — GF (1)' },
      { username: 'worker2', label: 'Worker — GF (2)' },
      { username: 'worker3', label: 'Worker — GF (3)' },
      { username: 'worker4', label: 'Worker — ST (1)' },
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const m = useMessages();
  const schema = useMemo(() => makeLoginFormSchema(m.FORM_MESSAGES), [m]);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: ({ user }) => {
      router.replace(user.mustChangePassword ? '/change-password' : roleHome(user.role));
    },
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? authErrorMessage(m, mutation.error.code)
      : mutation.error
        ? authErrorMessage(m)
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-2xl">{m.UI.appName}</CardTitle>
            <LocaleToggle />
          </div>
          <CardDescription>{m.UI.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="username">{m.UI.username}</Label>
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                {...register('username')}
              />
              {errors.username && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.username.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{m.UI.password}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-sm text-destructive" role="alert" data-testid="login-error">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? m.UI.loggingIn : m.UI.loginSubmit}
            </Button>
          </form>

          {/* DEV ONLY — never rendered in production (NODE_ENV gate below is
              statically inlined by Next, so this whole block is stripped from
              the prod bundle). Remove entirely before any pilot/production build. */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 rounded-lg border border-dashed p-3" data-testid="dev-credentials">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {m.UI.devCredentialsTitle}
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                {m.UI.devCredentialsPassword} <code className="rounded bg-muted px-1">{DEV_PASSWORD}</code>
              </p>
              <div className="grid gap-2.5">
                {DEV_LOGIN_GROUPS.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase text-muted-foreground/80">
                      {g.group}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.logins.map((c) => (
                        <button
                          key={c.username}
                          type="button"
                          className="rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setValue('username', c.username, { shouldValidate: true });
                            setValue('password', DEV_PASSWORD, { shouldValidate: true });
                          }}
                        >
                          <span className="font-medium">{c.username}</span>
                          <span className="block text-muted-foreground">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
