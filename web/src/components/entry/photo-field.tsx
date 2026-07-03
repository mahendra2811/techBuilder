'use client';

/**
 * Optional photo attachment for entry forms: camera-first file input.
 * The FILE stays in parent state; the actual (best-effort) upload happens at
 * submit time via lib/media-upload — a failed upload never blocks the record.
 */
import { useRef } from 'react';
import { Camera, X } from 'lucide-react';
import { ENTRY_UI } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function PhotoField({
  file,
  onChange,
  testId,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  testId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <Label>{ENTRY_UI.photo}</Label>
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
          <span className="min-w-0 truncate text-muted-foreground">
            {ENTRY_UI.photoSelected}: {file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={ENTRY_UI.photoRemove}
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => inputRef.current?.click()}>
          <Camera aria-hidden="true" />
          {ENTRY_UI.photo}
        </Button>
      )}
    </div>
  );
}
