"use client";

/**
 * Optional (or caller-overridden-required) photo attachment for entry forms:
 * camera-first file input. The FILE stays in parent state; the actual
 * (best-effort) upload happens at submit time via lib/media-upload — a
 * failed upload never blocks the record.
 *
 * ALL visible text — the outer label AND the button/selected-state copy —
 * honors the `label` prop. Previously only the outer <Label> did, so a
 * caller passing a required-field label (e.g. "मीटर की फोटो") still saw the
 * default optional receipt-photo copy on the actual button, which read as
 * contradictory/wrong for a required field. Default (no `label`) is
 * unchanged for existing callers.
 */
import { useEffect, useMemo, useRef } from "react";
import { Camera, X } from "lucide-react";
import { useMessages } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PhotoField({
  file,
  onChange,
  testId,
  label,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  testId: string;
  /** Override the default "Receipt photo (optional)" copy everywhere in this
   * field (outer label + button + selected state) — e.g. a required meter photo. */
  label?: string;
}) {
  const m = useMessages();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldLabel = label ?? m.ENTRY_UI.photo;

  // Thumbnail preview, same pattern as PhotoMultiField: an object URL derived
  // straight from `file` (no extra state), revoked on change/unmount.
  const thumbUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, [thumbUrl]);

  return (
    <div className="grid gap-2">
      <Label>{fieldLabel}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid={testId}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 text-sm">
          <div
            className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted bg-cover bg-center"
            style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
            role="img"
            aria-label={fieldLabel}
            data-testid={`${testId}-thumb`}
          />
          <span className="min-w-0 truncate text-muted-foreground">
            {m.ENTRY_UI.photoSelected}: {file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.ENTRY_UI.photoRemove}
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => inputRef.current?.click()}
        >
          <Camera aria-hidden="true" />
          {fieldLabel}
        </Button>
      )}
    </div>
  );
}
