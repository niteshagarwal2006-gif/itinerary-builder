"use client";

import { useState } from "react";
import type { Itinerary, Lang } from "@/lib/itinerary/types";
import { LANGS } from "@/lib/itinerary/types";
import { applyFields, collectFields, type VerifyIssue } from "@/lib/ai/fields";
import { Button, cn } from "@/components/ui";

const nativeName = (code: Lang) =>
  LANGS.find((l) => l.code === code)?.native ?? code;

/**
 * Per-itinerary output language + AI actions. Changing the language offers to
 * translate the content; "Vérifier" grammar-checks the text and lists fixes.
 */
export function LanguageBar({
  itinerary,
  onChange,
}: {
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
}) {
  const current: Lang = itinerary.outputLanguage ?? "fr";
  const [busy, setBusy] = useState<null | "translate" | "verify">(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<VerifyIssue[] | null>(null);

  async function changeLanguage(target: Lang) {
    setError(null);
    setIssues(null); // verification results are language-specific; drop stale ones
    if (target === current) return;
    const hasContent = collectFields(itinerary).length > 0;
    if (!hasContent) {
      onChange({ ...itinerary, outputLanguage: target });
      return;
    }
    const translate = window.confirm(
      `Translate the text from ${nativeName(current)} to ${nativeName(target)}?\n\n` +
        `OK: translate the content.\nCancel: change the language without translating.`
    );
    if (!translate) {
      onChange({ ...itinerary, outputLanguage: target });
      return;
    }
    setBusy("translate");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Translation failed.");
        return;
      }
      onChange(data.itinerary as Itinerary);
    } catch {
      setError("Could not reach the translation service.");
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy("verify");
    setError(null);
    setIssues(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Verification failed.");
        return;
      }
      setIssues((data.issues as VerifyIssue[]) ?? []);
    } catch {
      setError("Could not reach the verification service.");
    } finally {
      setBusy(null);
    }
  }

  /** Current text of each field by id — to detect content edited after verifying. */
  function currentTextById(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const f of collectFields(itinerary)) map[f.id] = f.text;
    return map;
  }

  function applyIssue(issue: VerifyIssue) {
    if (!issue.suggestion.trim()) return; // nothing to apply; never blank a field
    if (currentTextById()[issue.id] !== issue.original) {
      setError("The content changed since verification — run “Check language” again.");
      setIssues((prev) => (prev ? prev.filter((i) => i !== issue) : prev));
      return;
    }
    onChange(applyFields(itinerary, { [issue.id]: issue.suggestion }));
    setIssues((prev) => (prev ? prev.filter((i) => i !== issue) : prev));
  }

  function applyAll() {
    if (!issues?.length) return;
    const current = currentTextById();
    const map: Record<string, string> = {};
    let stale = 0;
    for (const i of issues) {
      if (!i.suggestion.trim()) continue;
      if (current[i.id] !== i.original) {
        stale++; // field was edited since verification — skip rather than clobber
        continue;
      }
      map[i.id] = i.suggestion;
    }
    if (Object.keys(map).length) onChange(applyFields(itinerary, map));
    setIssues(null);
    if (stale) {
      setError(`${stale} fix(es) skipped: the content changed since verification.`);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-deep">Document language</span>
          <select
            value={current}
            disabled={busy !== null}
            onChange={(e) => void changeLanguage(e.target.value as Lang)}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink shadow-sm outline-none transition focus:border-deep focus:ring-2 focus:ring-deep/15 disabled:opacity-50"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </label>

        <Button variant="secondary" onClick={() => void verify()} disabled={busy !== null}>
          {busy === "verify" ? "Checking…" : "Check language"}
        </Button>

        {busy === "translate" && (
          <span className="text-sm text-ink/60">Translating…</span>
        )}
        {error && <span className="text-sm font-medium text-red-700">{error}</span>}
      </div>

      {issues && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-deep">
              {issues.length === 0
                ? "No issues found ✓"
                : `${issues.length} ${issues.length > 1 ? "issues found" : "issue found"}`}
            </h3>
            <div className="flex items-center gap-2">
              {issues.length > 0 && (
                <Button variant="primary" onClick={applyAll}>
                  Fix all
                </Button>
              )}
              <button
                type="button"
                className="text-xs font-medium text-ink/55 hover:text-ink"
                onClick={() => setIssues(null)}
              >
                Close
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li
                key={`${issue.id}-${i}`}
                className="rounded-md border border-line bg-paper p-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        issue.severity === "error" ? "bg-red-600" : "bg-amber-500"
                      )}
                      aria-hidden
                    />
                    <span className="font-semibold text-deep">{issue.label}</span>
                  </span>
                  <Button variant="secondary" onClick={() => applyIssue(issue)}>
                    Apply
                  </Button>
                </div>
                <p className="mt-1 text-ink/70">{issue.message}</p>
                {issue.suggestion && (
                  <p className="mt-1 text-xs">
                    <span className="text-red-700 line-through">{issue.original}</span>{" "}
                    <span className="text-ink/40">→</span>{" "}
                    <span className="font-medium text-emerald-700">{issue.suggestion}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
