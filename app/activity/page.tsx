import { recentActivity } from "@/lib/ai/log";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const rows = recentActivity(200);

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 font-serif text-2xl font-bold text-deep">AI Activity Log</h1>
        <p className="mb-6 text-sm text-ink/70">
          Every AI/web generation, what was saved, and where. Used to avoid repeating work.
        </p>

        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream/50 text-xs uppercase tracking-wide text-ink/70">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Input</th>
                <th className="px-4 py-3">Output / Saved to</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-cream/30">
                  <td className="whitespace-nowrap px-4 py-3 text-ink/80">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-deep">{row.category}</td>
                  <td className="px-4 py-3 text-ink/80">{row.provider ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "success"
                          ? "bg-green-100 text-green-800"
                          : row.status === "cached"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-ink/70">
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(row.inputSummary, null, 2)}
                    </pre>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-ink/70">
                    {row.errorMessage ? (
                      <span className="text-red-600">{row.errorMessage}</span>
                    ) : (
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(row.outputSummary, null, 2)}
                      </pre>
                    )}
                    {row.savedTo && (
                      <div className="mt-1 text-xs text-gold">saved: {row.savedTo}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {row.durationMs ? `${row.durationMs} ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-ink/50">
              No AI activity logged yet. Generate an itinerary to see entries.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
