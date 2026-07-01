import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { PresignMediaInput, PresignMediaResult } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

/** Derive a file extension from a MIME content-type string. */
function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'audio/m4a': '.m4a',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf',
  };
  return map[contentType.toLowerCase()] ?? '';
}

@Injectable()
export class MediaService {
  constructor(private readonly dbs: DbService) {}

  async presignMedia(p: Principal, input: PresignMediaInput): Promise<PresignMediaResult> {
    const ext = extFromContentType(input.contentType);
    const r2Key = `${p.orgId}/${input.parentType}/${input.parentId}/${input.id}${ext}`;
    const uploadUrl = `${process.env['R2_PUBLIC_BASE'] ?? ''}/${r2Key}`;

    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.media)
        .values({
          id: input.id,
          orgId: p.orgId,
          kind: input.kind,
          r2Key,
          thumbKey: null,
          parentType: input.parentType,
          parentId: input.parentId,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          takenAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (!row) {
        // idempotent: check if record already exists (same id from a retry)
        const [existing] = await tx
          .select()
          .from(schema.media)
          .where(eq(schema.media.id, input.id));
        if (!existing) throw new ApiException('CONFLICT', 'Could not create media record');
      }
    });

    return { mediaId: input.id, uploadUrl, r2Key };
  }
}
