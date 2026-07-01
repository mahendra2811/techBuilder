import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { PresignMediaInput } from '@techbuilder/contracts';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const PresignMediaSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['PHOTO', 'RECEIPT', 'VOICE']),
  parentType: z.string().min(1),
  parentId: z.string().uuid(),
  contentType: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // No @RequireAction — any authenticated user may presign a media upload
  @Post('presign')
  presignMedia(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(PresignMediaSchema)) body: PresignMediaInput,
  ) {
    return this.media.presignMedia(u, body);
  }
}
