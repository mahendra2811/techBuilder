"use client";

/**
 * Voice-note recorder for entry forms: idle → recording → recorded, using
 * MediaRecorder. Controlled (the Blob lives in the parent's state, same
 * pattern as PhotoField); the actual (best-effort) upload happens at submit
 * time via lib/media-upload. Feature-flag gating (org voiceNotes) is the
 * caller's job — this component stays pure.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { useMessages } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Preferred → fallback mime types (Chrome/Firefox support webm/opus; Safari falls back to mp4). */
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceField({
  value,
  onChange,
  label,
  testId,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
  label?: string;
  testId: string;
}) {
  const m = useMessages();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Stop the mic + timer on unmount, whatever state we're in. Detach the
  // recorder's handlers first so a late `onstop` can't fire `onChange` (or
  // touch state) after the component is gone.
  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      stopTracks();
    };
  }, []);

  // Playback URL is derived straight from the controlled `value` (no state)
  // and always revoked when it changes or the component unmounts.
  const playbackUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => {
    return () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(m.MEDIA_UI.micUnsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        clearTimer();
        stopTracks();
        setRecording(false);
        onChange(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError(m.MEDIA_UI.micPermissionDenied);
      stopTracks();
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
  };

  const remove = () => {
    onChange(null);
  };

  return (
    <div className="grid gap-2">
      <Label>{label ?? m.MEDIA_UI.voiceNote}</Label>

      {recording ? (
        <div className="flex items-center gap-2" role="status" data-testid={`${testId}-recording`}>
          <span
            className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-destructive"
            aria-hidden="true"
          />
          <span className="text-sm tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
          <span className="sr-only">{m.MEDIA_UI.recordingLabel}</span>
          <Button type="button" variant="destructive" size="sm" data-testid={`${testId}-stop`} onClick={stop}>
            <Square aria-hidden="true" />
            {m.MEDIA_UI.recordStop}
          </Button>
        </div>
      ) : value && playbackUrl ? (
        <div className="flex items-center gap-2">
          <audio controls src={playbackUrl} className="h-9 max-w-[240px]" data-testid={`${testId}-player`} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.MEDIA_UI.recordDelete}
            data-testid={`${testId}-delete`}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          data-testid={`${testId}-record`}
          onClick={() => void start()}
        >
          <Mic aria-hidden="true" />
          {m.MEDIA_UI.recordStart}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
