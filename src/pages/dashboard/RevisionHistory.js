import SubmissionFilePreview from "./SubmissionFilePreview";

export default function RevisionHistory({ history = [] }) {
  if (!history?.length) return null;
  return <section aria-label="Revision history" className="my-4 space-y-3 rounded-lg border bg-white p-4">
    <h3 className="font-semibold">Revision history</h3>
    {history.map((entry, index) => <details key={entry.id} className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-medium">Earlier submission {index + 1}: {entry.essay_title} · {new Date(entry.requested_at).toLocaleString()}</summary>
      <p className="my-2 whitespace-pre-wrap text-sm">Revision instructions: {entry.message}</p>
      <p className="mb-2 text-xs text-gray-600">{entry.completed_at ? "Revision submitted" : "Awaiting revision"}</p>
      <SubmissionFilePreview fileUrl={entry.file_url} transcript={entry.transcribed_text} />
      {entry.transcribed_text && <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{entry.transcribed_text}</pre>}
    </details>)}
  </section>;
}
