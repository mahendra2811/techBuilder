/**
 * Dev-only role-visibility matrix — the configuration truth-check.
 * Renders the FULL frozen PERMISSIONS matrix (12 actions × 5 roles) straight
 * from @techbuilder/contracts via scopeFor(), so it matches
 * Build-Readiness-Spec §4 by construction. Requires a session; the
 * logged-in role's column is highlighted.
 *
 * Testids: table = "rbac-matrix"; cells = "cell-{ROLE}-{action}" with the
 * action verbatim (dots kept), e.g. cell-OWNER-record.enter.
 */
import type { Metadata } from 'next';
import { ACTIONS, ROLES, scopeFor } from '@techbuilder/contracts';
import { requireSession } from '@/lib/server/require-session';
// Dev-only surface — deliberately pinned to the ENGLISH catalog (no locale).
import { en } from '@/lib/i18n/messages.en';
import { cn } from '@/lib/utils';

const RBAC_MATRIX_UI = en.RBAC_MATRIX_UI;
const ROLE_LABEL = en.ROLE_LABELS;

export const metadata: Metadata = { title: RBAC_MATRIX_UI.title };

export default async function Page() {
  const { user } = await requireSession();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold">{RBAC_MATRIX_UI.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{RBAC_MATRIX_UI.subtitle}</p>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table data-testid="rbac-matrix" className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">{RBAC_MATRIX_UI.actionHeader}</th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className={cn(
                    'px-3 py-2 font-medium',
                    role === user.role && 'bg-primary/10 text-primary',
                  )}
                >
                  {ROLE_LABEL[role]}
                  {role === user.role ? (
                    <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold uppercase">
                      {RBAC_MATRIX_UI.yourRole}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((action) => (
              <tr key={action} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-medium">
                  {action}
                </th>
                {ROLES.map((role) => {
                  const scope = scopeFor(role, action);
                  const denied = scope === 'NONE';
                  return (
                    <td
                      key={role}
                      data-testid={`cell-${role}-${action}`}
                      className={cn(
                        'px-3 py-2 font-mono text-xs',
                        role === user.role && 'bg-primary/5',
                        denied && 'text-muted-foreground',
                      )}
                    >
                      {denied ? RBAC_MATRIX_UI.denied : scope}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{RBAC_MATRIX_UI.deniedLegend}</p>
    </div>
  );
}
