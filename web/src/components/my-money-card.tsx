'use client';

/**
 * "मैंने लिया पैसा / Money I've taken" — shared building blocks (CW-7, moved to
 * the cross-role Profile page in frozen.9; the old collapsed <MyMoneyCard />
 * dashboard mount was removed — every role's "money I've taken" now lives at
 * /{role}/profile instead of duplicated on each dashboard).
 *
 * What's still here, imported elsewhere:
 *  - `TagBadge` — the small SALARY/PERSONAL pill, reused by anything that
 *    lists money-taken entries.
 *  - `MoneyTakenList` — the presentational total + entries list. The caller
 *    owns the query: profile-screen.tsx (self, GET /me/money) and
 *    person-insights-screen.tsx (upper-role view, GET /users/:id/money) both
 *    render the same list from their own `MyMoney` data.
 *
 * GET /me/money (and its upper-role sibling) returns ONLY ACCOUNTANT-VERIFIED
 * SALARY/PERSONAL cash draws (WORK-tagged transfers are ordinary khata
 * advances and never appear here) — newest first, plus a running total.
 */
import { Check } from 'lucide-react';
import type { MoneyTag, MyMoney } from '@techbuilder/contracts';
import { formatBusinessDate } from '@/lib/business-date';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ShowMore } from '@/components/ui/show-more';
import { EmptyState } from '@/components/entry/states';

const UI = {
  en: {
    title: "Money I've taken",
    tapToShow: 'Tap to view',
    refresh: 'Refresh',
    collapse: 'Collapse',
    expand: 'Expand',
    totalLabel: 'Total',
    empty: 'No personal draws yet',
    fromLabel: 'From',
    verifiedHint: 'Accountant verified',
    tagSalary: 'Salary',
    tagPersonal: 'Personal',
  },
  hi: {
    title: 'मैंने लिया पैसा',
    tapToShow: 'देखने के लिए दबाएँ',
    refresh: 'रीफ़्रेश करें',
    collapse: 'छोटा करें',
    expand: 'बड़ा करें',
    totalLabel: 'कुल',
    empty: 'अभी तक कोई निजी रक़म नहीं',
    fromLabel: 'किससे',
    verifiedHint: 'अकाउंटेंट द्वारा सत्यापित',
    tagSalary: 'वेतन',
    tagPersonal: 'निजी',
  },
} as const;

export function TagBadge({ tag, ui }: { tag: MoneyTag; ui?: { tagSalary: string; tagPersonal: string } }) {
  if (tag !== 'SALARY' && tag !== 'PERSONAL') return null;
  const labels = ui ?? { tagSalary: 'Salary', tagPersonal: 'Personal' };
  return (
    <span
      data-testid={`my-money-tag-${tag}`}
      className={cn(
        'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tag === 'SALARY' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
      )}
    >
      {tag === 'SALARY' ? labels.tagSalary : labels.tagPersonal}
    </span>
  );
}

/**
 * frozen.9 — the money-taken list body, extracted so the Profile page (self via GET /me/money,
 * or an upper role via GET /users/:id/money) and this dashboard card render the same thing.
 * Purely presentational: the caller owns the query.
 */
export function MoneyTakenList({
  money,
  locale,
}: {
  money: MyMoney;
  locale: 'en' | 'hi';
}) {
  const ui = UI[locale];
  const entries = money.entries;
  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground">{ui.totalLabel}</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="my-money-total">
          {formatPaise(money.totalPaise)}
        </p>
      </div>
      {entries.length === 0 ? (
        <EmptyState label={ui.empty} />
      ) : (
        <ShowMore
          items={entries}
          initial={7}
          as="ul"
          className="divide-y"
          testIdPrefix="my-money"
          renderItem={(e) => (
            <li key={e.id} className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`my-money-row-${e.id}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{formatBusinessDate(e.businessDate)}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(e.amountPaise)}</p>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <TagBadge tag={e.tag} ui={ui} />
                <span className="min-w-0 truncate">
                  {ui.fromLabel} {e.fromName}
                </span>
                {e.note && <span className="min-w-0 truncate">· {e.note}</span>}
              </p>
              <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <Check className="size-3" aria-hidden="true" />
                {ui.verifiedHint}
              </p>
            </li>
          )}
        />
      )}
    </>
  );
}
