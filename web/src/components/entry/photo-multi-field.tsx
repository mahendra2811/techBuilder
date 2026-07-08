"use client";

/**
 * Multi-photo attachment for entry forms: camera + gallery, up to `max`
 * photos. Controlled (files live in the parent's state, same as PhotoField);
 * the actual (best-effort) upload happens at submit time via
 * lib/media-upload — a failed upload never blocks the record.
 */
import { useEffect, useMemo, useRef } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { useMessages } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PhotoMultiField({
  files,
  onChange,
  max,
  label,
  testId,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
  label?: string;
  testId: string;
}) {
  const m = useMessages();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Object URLs are derived straight from `files` (no state) and revoked
  // whenever the set changes or the component unmounts.
  const thumbUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => {
    return () => {
      thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [thumbUrls]);

  const atMax = files.length >= max;

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const room = max - files.length;
    if (room <= 0) return;
    onChange([...files, ...Array.from(picked).slice(0, room)]);
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{label ?? m.MEDIA_UI.photos}</Label>
        <span className="text-xs text-muted-foreground" data-testid={`${testId}-count`}>
          {files.length}/{max}
        </span>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid={`${testId}-camera-input`}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        data-testid={`${testId}-gallery-input`}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atMax}
          data-testid={`${testId}-camera-btn`}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera aria-hidden="true" />
          {m.MEDIA_UI.camera}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atMax}
          data-testid={`${testId}-gallery-btn`}
          onClick={() => galleryRef.current?.click()}
        >
          <ImageIcon aria-hidden="true" />
          {m.MEDIA_UI.gallery}
        </Button>
      </div>

      {atMax && (
        <p className="text-xs text-muted-foreground">{m.MEDIA_UI.photosMaxReached}</p>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid={`${testId}-thumbs`}>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted bg-cover bg-center",
              )}
              style={thumbUrls[index] ? { backgroundImage: `url(${thumbUrls[index]})` } : undefined}
            >
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                className="absolute top-0.5 right-0.5"
                aria-label={m.MEDIA_UI.photoRemove}
                data-testid={`${testId}-remove-${index}`}
                onClick={() => removeAt(index)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
