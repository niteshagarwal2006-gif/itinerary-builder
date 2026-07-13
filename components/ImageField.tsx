"use client";

import { useRef, useState } from "react";
import type { ImageRef } from "@/lib/itinerary/types";
import { Button, TextInput, cn } from "./ui";

/**
 * Reusable image control: upload a file, paste a web URL, set a caption, or
 * remove. Used for the logo, route map, hotel photos and sightseeing photos.
 *
 * Uploaded files are stored server-side (and previewed via their /uploads URL);
 * web URLs are kept as-is and fetched when the .docx is built.
 */
export function ImageField({
  value,
  onChange,
  label = "Image",
  previewHeight = 150,
}: {
  value?: ImageRef;
  onChange: (ref: ImageRef | undefined) => void;
  label?: string;
  previewHeight?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Upload failed.");
        return;
      }
      onChange({
        uploadId: data.uploadId,
        url: data.url,
        width: data.width,
        height: data.height,
        caption: value?.caption,
      });
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function applyUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    onChange({ url: u, caption: value?.caption });
    setUrlDraft("");
    setError(null);
  }

  const hasImage = Boolean(value?.url);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/70">
          {label}
        </span>
        {hasImage && (
          <button
            type="button"
            className="text-xs font-medium text-red-700 hover:underline"
            onClick={() => {
              onChange(undefined);
              setError(null);
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void uploadFile(f);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-white p-3 text-center transition",
          dragOver ? "border-deep bg-cream" : "border-line"
        )}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value!.url}
            alt={value?.caption || label}
            style={{ maxHeight: previewHeight }}
            className="max-w-full rounded object-contain"
          />
        ) : (
          <p className="py-3 text-xs text-ink/45">
            {busy ? "Uploading…" : "Drag an image here, or:"}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {hasImage ? "Replace" : "Upload"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TextInput
          type="url"
          value={urlDraft}
          onChange={setUrlDraft}
          placeholder="…or paste an image URL (https://…)"
          onBlur={applyUrl}
        />
        <Button variant="secondary" onClick={applyUrl} disabled={!urlDraft.trim()}>
          OK
        </Button>
      </div>

      {hasImage && (
        <TextInput
          value={value?.caption ?? ""}
          onChange={(c) => onChange({ ...value!, caption: c })}
          placeholder="Caption (optional)"
        />
      )}

      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
