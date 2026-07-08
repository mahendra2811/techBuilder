/**
 * Optional receipt/photo upload: client-side downscale → POST /media/presign →
 * PUT bytes to the presigned URL.
 *
 * Photos are OPTIONAL on every record DTO, and R2 is not configured in every
 * environment (locally presign returns a stub URL), so this helper NEVER throws:
 * any failure returns null and the caller saves the record without the photo,
 * showing a non-blocking notice.
 */
import { uuidv7 } from 'uuidv7';
import type { MediaKind, PresignMediaInput, PresignMediaResult, UUID } from '@techbuilder/contracts';
import { api } from './api-client';

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/** Downscale to ≤1600px long edge, JPEG ~0.7. Falls back to the original file. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file; // non-decodable image → upload as-is (server may still reject; upload is best-effort)
  }
}

export interface UploadPhotoOpts {
  kind: MediaKind;
  /** Entity family of the record the media belongs to, e.g. "expense". */
  parentType: string;
  /** Client-generated id of the record being created (known before POST). */
  parentId: UUID;
}

/**
 * Best-effort photo upload. Returns the mediaId to stick on the record, or
 * null when presign/upload failed (caller proceeds WITHOUT the photo).
 */
export async function uploadPhoto(file: File, opts: UploadPhotoOpts): Promise<UUID | null> {
  try {
    const blob = await downscale(file);
    const contentType = blob.type || 'image/jpeg';
    const input: PresignMediaInput = {
      id: uuidv7(),
      kind: opts.kind,
      parentType: opts.parentType,
      parentId: opts.parentId,
      contentType,
    };
    const presigned = await api<PresignMediaResult>('POST', '/media/presign', input);
    const res = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: blob,
    });
    if (!res.ok) return null;
    return presigned.mediaId;
  } catch {
    return null;
  }
}

/**
 * Sequential best-effort upload of several photos (multi-photo picker).
 * Never throws; a failed photo is simply skipped, so the returned array of
 * mediaIds may be shorter than `files` (caller decides whether to warn).
 */
export async function uploadPhotos(files: File[], opts: UploadPhotoOpts): Promise<UUID[]> {
  const mediaIds: UUID[] = [];
  for (const file of files) {
    const mediaId = await uploadPhoto(file, opts);
    if (mediaId) mediaIds.push(mediaId);
  }
  return mediaIds;
}

export interface UploadVoiceOpts {
  /** Entity family of the record the media belongs to, e.g. "progressNote". */
  parentType: string;
  /** Client-generated id of the record being created (known before POST). */
  parentId: UUID;
}

/**
 * Best-effort voice-note upload. No downscaling (audio, not an image).
 * Returns the mediaId to stick on the record, or null when presign/upload
 * failed (caller proceeds WITHOUT the voice note).
 */
export async function uploadVoice(blob: Blob, opts: UploadVoiceOpts): Promise<UUID | null> {
  try {
    const contentType = blob.type || 'audio/webm';
    const input: PresignMediaInput = {
      id: uuidv7(),
      kind: 'VOICE',
      parentType: opts.parentType,
      parentId: opts.parentId,
      contentType,
    };
    const presigned = await api<PresignMediaResult>('POST', '/media/presign', input);
    const res = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: blob,
    });
    if (!res.ok) return null;
    return presigned.mediaId;
  } catch {
    return null;
  }
}
