import SubmissionFilePreview from "./SubmissionFilePreview";
import { processingLabel } from "./submissionProgress";

export default function SubmissionStation({ submission, onReview, onClear }) {
  const state = submission.processingState || "submitted";
  const result = state === "ready" ? submission.scanResult : null;
  return <section id="scan-station-form-top" className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">{submission.studentName} — {submission.essayTitle}</h3>
        <p role="status" className="text-sm font-semibold">{processingLabel(state)}</p></div>
      <button type="button" onClick={onClear} className="rounded border bg-white px-3 py-2 text-sm">Clear station</button>
    </div>
    <SubmissionFilePreview fileUrl={submission.fileUrl} transcript={submission.transcribedText} />
    {submission.transcribedText && <section aria-label="Submitted essay text" className="rounded-lg border bg-white p-4">
      <h4 className="font-bold">Submitted essay text</h4>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm">{submission.transcribedText}</pre>
    </section>}
    {["submitted", "processing"].includes(state) && <p className="text-sm">The submission is saved. The API check runs in the background, and its results will appear here when ready. You can leave this page.</p>}
    {state === "failed" && <p role="alert" className="text-sm text-red-700">{submission.processingError || "Automatic processing failed. Open review to retry."}</p>}
    {result && <div className="space-y-2 rounded-lg border bg-white p-4">
      <h4 className="font-bold">Plagiarism result: {Math.round(result.score ?? result.plagiarism_score ?? 0)}% similarity</h4>
      {result.provider === "copyleaks" && <p className="text-sm font-semibold">Copyleaks API result · Scan {result.scanId}</p>}
      <p className="text-sm">{result.summary}</p>
      {result.mode === "classroom" && <p className="text-sm font-semibold">Classroom comparison only. Internet sources were not checked.</p>}
      <p className="text-sm">{result.peerComparisonEnabled === false ? "Classroom comparison disabled for this check." : `Classroom similarity: ${Math.round(result.peerScore ?? result.peerSimilarity?.peer_similarity_score ?? 0)}%`}</p>
      {!!result.matchedSources?.length && <ul className="list-inside list-disc text-sm">
        {result.matchedSources.map((source, index) => <li key={source.url || index}>
          {/^https?:\/\//i.test(source.url || "") ? <a href={source.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{source.title || source.url}</a> : source.title || "Matched source"}
        </li>)}
      </ul>}
    </div>}
    <button type="button" onClick={() => onReview(submission)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">{state === "failed" ? "Review failure and retry" : "View full report & grade"}</button>
  </section>;
}
