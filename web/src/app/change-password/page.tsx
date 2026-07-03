'use client';

/**
 * Forced password change (mustChangePassword gate) — minimal Phase-1 flow.
 * Calls the backend's POST /auth/change-password through the authenticated
 * proxy, then re-reads /me for the (now-cleared) flag + role and routes home.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiClientError, changePassword, me } from '@/lib/api-client';
import { FORM_MESSAGES, UI, authErrorMessage } from '@/lib/messages';
import { roleHome } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ChangePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, FORM_MESSAGES.currentPasswordRequired),
    newPassword: z.string().min(8, FORM_MESSAGES.newPasswordMin), // backend enforces min(8) too
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: FORM_MESSAGES.confirmMismatch,
    path: ['confirmPassword'],
  });
type ChangePasswordForm = z.infer<typeof ChangePasswordFormSchema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(ChangePasswordFormSchema) });

  const mutation = useMutation({
    mutationFn: async (values: ChangePasswordForm) => {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      return me();
    },
    onSuccess: ({ user }) => {
      router.replace(roleHome(user.role));
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
          <CardTitle className="text-2xl">{UI.changePasswordTitle}</CardTitle>
          <CardDescription>{UI.changePasswordSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">{UI.currentPassword}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{UI.newPassword}</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
              {errors.newPassword && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">{UI.confirmPassword}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-sm text-destructive" role="alert" data-testid="change-password-error">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? UI.changingPassword : UI.changePasswordSubmit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
