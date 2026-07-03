'use client';

/**
 * Login page — react-hook-form + zod (form-shape only; LoginInput's deviceId is
 * added server-side by the login Route Handler). On success routes by role, via
 * the change-password gate when the backend flags mustChangePassword.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, login } from '@/lib/api-client';
import { FORM_MESSAGES, UI, authErrorMessage } from '@/lib/messages';
import { roleHome } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LoginFormSchema = z.object({
  username: z.string().min(1, FORM_MESSAGES.usernameRequired),
  password: z.string().min(1, FORM_MESSAGES.passwordRequired),
});
type LoginForm = z.infer<typeof LoginFormSchema>;

/**
 * DEV ONLY — seeded test credentials shown on the login screen for fast role
 * switching during development. REMOVE this block (and its render section
 * below) before any pilot/production build. Matches backend/merchants/dev/.
 */
const DEV_PASSWORD = 'changeme123';
const DEV_LOGINS: Array<{ username: string; label: string }> = [
  { username: 'owner', label: 'Owner' },
  { username: 'sm1', label: 'Site Manager' },
  { username: 'th1', label: 'Team Head (GF)' },
  { username: 'th2', label: 'Team Head (ST)' },
  { username: 'driver1', label: 'Driver (GF)' },
  { username: 'driver3', label: 'Driver (ST)' },
  { username: 'worker1', label: 'Worker' },
];

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginFormSchema) });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: ({ user }) => {
      router.replace(user.mustChangePassword ? '/change-password' : roleHome(user.role));
    },
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? authErrorMessage(mutation.error.code)
      : mutation.error
        ? authErrorMessage()
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{UI.appName}</CardTitle>
          <CardDescription>{UI.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="username">{UI.username}</Label>
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
              <Label htmlFor="password">{UI.password}</Label>
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
              {mutation.isPending ? UI.loggingIn : UI.loginSubmit}
            </Button>
          </form>

          {/* DEV ONLY — remove before pilot (see DEV_LOGINS above). */}
          <div className="mt-6 rounded-lg border border-dashed p-3" data-testid="dev-credentials">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {UI.devCredentialsTitle}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {UI.devCredentialsPassword} <code className="rounded bg-muted px-1">{DEV_PASSWORD}</code>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEV_LOGINS.map((c) => (
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
        </CardContent>
      </Card>
    </main>
  );
}
