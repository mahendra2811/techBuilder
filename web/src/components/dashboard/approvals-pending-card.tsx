'use client';

/** WO-3 (wave 2): dashboard callout linking straight to the approvals inbox —
 * renders nothing when there is nothing pending (never an empty nag). */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent } from '@/components/ui/card';

export function ApprovalsPendingCard({ count, href }: { count: number; href: string }) {
  const m = useMessages();
  if (count <= 0) return null;
  return (
    <Card data-testid="approvals-pending-card">
      <CardContent>
        <Link href={href} data-testid="approvals-pending-link" className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{m.OWNER_UI.approvalsPendingTitle}</p>
            <p className="truncate text-xs text-muted-foreground" data-testid="approvals-pending-count">
              {count} {m.OWNER_UI.approvalsPendingSuffix}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
