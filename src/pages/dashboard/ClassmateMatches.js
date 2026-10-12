import { useEffect, useState } from "react";
import { checkPeerSimilarityViaBackend } from "./plagiarismScan";
import { PaginatedList } from "./Pagination";
import { PeerComparison, SimilarityDialog } from "./PeerSimilarityReview";

export default function ClassmateMatches({ submission, onInspect, compact = false, storedMatches, stale = false }) {
  const [inspecting, setInspecting] = useState(null);
  const id = submission?.id;
  const assignmentId = submission?.assignmentId;
  const classroomId = submission?.classroomId;
  const savedText = submission?.transcribedText;
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (storedMatches !== undefined) return undefined;
    let cancelled = false;
    setResult(null); setError("");
    checkPeerSimilarityViaBackend({ submissionId: id, assignmentId, classroomId }).then((body) => {
      if (!cancelled) setResult(body);
    }).catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [id, assignmentId, classroomId, savedText, attempt, storedMatches]);
  const displayResult = storedMatches !== undefined ? { all_matches: storedMatches, stored: true,
    enabled: submission.scanResult?.peerComparisonEnabled,
    checked: Boolean(submission.scanResult?.peerSimilarity) } : result;
  return <section aria-label="Classmate similarity" className="mt-5 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
    <h4 className="font-semibold">{compact ? "Peer Similarity" : "Classmate similarity"}</h4>
    <p className="text-sm">Same classroom and assignment. Similarity is information for review, not a finding of plagiarism.</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline">Retry matches</button></p>
      : !displayResult ? <p role="status">Checking classmate matches...</p>
      : displayResult.enabled === false ? <p>Classroom comparison is disabled in your profile.</p>
      : <>
        <p className="text-sm">{stale ? "Previous transcription: re-run similarity to update peer matches." : displayResult.stored ? (displayResult.checked ? "Saved matches for the current transcription." : "No saved peer comparison is available.") : `Compared with ${displayResult.total_peers_compared} classmate submissions.`}</p>
        {compact && <p className="text-sm">Potential matches: {displayResult.all_matches?.length || 0}</p>}
        {displayResult.all_matches?.length ? <PaginatedList items={displayResult.all_matches} resetKey={id} label="Classmate matches">{rows =>
          <ul className="space-y-2">{rows.map(match => <li key={match.submission_id} className="rounded-lg bg-white p-3">
            {compact ? <p className="flex flex-wrap justify-between gap-2 font-medium"><span>{match.student_name || "Classmate"}</span><span>{match.score_percent}%</span></p> : <>
              <p className="font-medium">Similar answer detected</p>
              <p>Matched Student: {match.student_name || "Classmate"}</p>
              <p>Similarity: {match.score_percent}%</p>
            </>}
            <button type="button" aria-label={`Inspect match with ${match.student_name || "Classmate"}`}
              onClick={() => onInspect ? onInspect(match.submission_id) : setInspecting(match.submission_id)}
              className="mt-2 rounded-lg bg-[#137333] px-3 py-2 text-sm text-white">Inspect</button>
          </li>)}</ul>}
        </PaginatedList> : <p>{stale ? "Peer results need a new check." : displayResult.stored && !displayResult.checked
          ? "Peer similarity has not been checked." : "No classmate matches at or above the 15% reporting threshold."}</p>}
      </>}
    {inspecting && <SimilarityDialog title="Peer Similarity Review" onClose={() => setInspecting(null)}>
      <PeerComparison key={`${id}:${inspecting}`} submission={submission} matchedSubmissionId={inspecting} />
    </SimilarityDialog>}
  </section>;
}
