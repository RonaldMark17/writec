import { useEffect, useState } from "react";
import StudentReviewDialog from "./StudentReviewDialog";
import { apiFetch } from "../../apiFetch";

function Disclosure({ title, count, children, defaultOpen = false }) {
  return <details open={defaultOpen} className="border-t border-[#dadce0] py-3">
    <summary className="cursor-pointer font-medium">{title} <span className="text-sm font-normal">({count})</span></summary>
    <div className="mt-3 max-h-96 space-y-3 overflow-y-auto break-words">{children}</div>
  </details>;
}

export default function StudentSimilarity({ submission }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false, timer;
    const controller = new AbortController();
    setResult(null); setError(false); setExpanded(false);
    async function refresh() {
      try {
        const response = await apiFetch(`/api/submissions/${encodeURIComponent(submission.id)}/similarity`, { signal: controller.signal });
        if (!response.ok) throw new Error("Result unavailable");
        const data = await response.json();
        if (stopped) return;
        setResult(data); setError(false);
        if (["submitted", "processing"].includes(data.state)) timer = setTimeout(refresh, 5000);
      } catch (failure) { if (!stopped) setError(true); }
    }
    refresh();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [submission.id, submission.processingState, submission.processingJobId, attempt]);
  const failed = error || result?.state === "failed";
  const ready = result?.state === "ready";
  const sources = result?.sources || [], passages = result?.passages || [], peers = result?.peers || [];
  return <section aria-label="Similarity result" className="student-similarity">
    <h4 className="font-semibold">{ready ? "Similarity Result" : "Similarity Analysis"}</h4>
    {failed ? <div role="alert"><p>Similarity analysis could not be completed. Please try again later or contact your instructor.</p>
      <button type="button" className="mt-2 underline" onClick={() => setAttempt(value => value + 1)}>Refresh result</button></div>
      : result?.state === "unavailable" ? <p>A verified similarity result is not available yet.</p>
      : !ready ? <p role="status">Checking submission for similarity...</p>
      : <>
        {typeof result.score === "number" ? <p className="text-xl font-semibold">{result.score}% Similarity</p>
          : <p>Overall external similarity is unavailable. This result contains classroom comparison only.</p>}
        <p className="student-review-muted">{sources.length} matching source{sources.length === 1 ? "" : "s"}</p>
        <p className="text-sm">Similarity does not automatically mean plagiarism. Your instructor may review detected matches.</p>
        <button type="button" aria-haspopup="dialog" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="text-sm font-medium underline">
          View similarity details
        </button>
        {expanded && <StudentReviewDialog title="Similarity Details" closeLabel="Close similarity details" onClose={() => setExpanded(false)}>
        <div className="student-source-details">
          {!sources.length && !passages.length && !peers.length && <p>No detailed matches were supplied with this result.</p>}
          {sources.length > 0 && <Disclosure defaultOpen title="Detected Sources" count={sources.length}>{sources.map((source, index) => <div className="student-source-item" key={index}>
            <p className="font-medium">{source.title || `Source ${index + 1}`}</p>
            {source.domain && <p>{source.domain}</p>}
            {source.matched_words !== undefined && <p>Matched words: {source.matched_words}</p>}
            {source.url && /^https?:\/\//i.test(source.url) && <a className="break-all underline" href={source.url} target="_blank" rel="noopener noreferrer">Open source &#8599;</a>}
          </div>)}</Disclosure>}
          {passages.length > 0 && <Disclosure title="Matching Passages" count={passages.length}>{passages.map((passage, index) => <blockquote key={index} className="max-h-60 overflow-y-auto whitespace-pre-wrap">{passage.text}</blockquote>)}</Disclosure>}
          {peers.length > 0 && <Disclosure title="Peer Similarity" count={peers.length}>
            <p>{peers.length} similar classmate submission{peers.length === 1 ? "" : "s"} detected. These scores are separate from external similarity.</p>
            {peers.map((peer, index) => <p key={index}>Similar classmate submission detected / Similarity: {peer.score}%</p>)}
          </Disclosure>}
        </div></StudentReviewDialog>}
      </>}
  </section>;
}
