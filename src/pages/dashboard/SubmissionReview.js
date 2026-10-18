import { SimilarityDialog } from "./PeerSimilarityReview";
import EssayEvidence from "./EssayEvidence";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectEvidence, scopedPeerMatches, staleReport, validPercentage } from "./similarityEvidence";
import SubmissionFilePreview from "./SubmissionFilePreview";
import ClassmateMatches from "./ClassmateMatches";
import AssignmentComments from "./AssignmentComments";
import { PaginatedList } from "./Pagination";
import { CloseIcon, formatDateTime, StatusMessage } from "./shared";

export default function SubmissionReview({ submission, submissions = [], profile, text, result, scanning,
  progress, onRecheck, onClose, saving, onCopy, copied, error, message, grading,
  imageUrl, imageLoading, imageExpanded, onExpandImage }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const originalDetails = useRef(null);
  const peerDetails = useRef(null);
  const sourceDestination = useRef("sources");
  function openSourceDetails(destination = "sources") {
    sourceDestination.current = destination;
    setSourcesOpen(true);
  }
  useEffect(() => {
    if (sourcesOpen && sourceDestination.current === "peers") {
      peerDetails.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
      peerDetails.current?.focus({ preventScroll: true });
    }
  }, [sourcesOpen]);
  function reveal(ref) {
    if (!ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    ref.current.querySelector("summary")?.focus();
  }
  const [displayMode, setDisplayMode] = useState("all");
  const stale = staleReport({ ...submission, transcribedText: text, scanResult: result });
  const peers = useMemo(() => scopedPeerMatches({ ...submission, scanResult: result }, submissions), [submission, result, submissions]);
  const pending = ["submitted", "processing"].includes(submission.processingState);
  const failed = submission.processingState === "failed";
  const evidence = useMemo(() => stale || pending || failed || scanning ? { ranges: [], unresolved: [] } : collectEvidence(text, result, peers), [text, result, peers, stale, pending, failed, scanning]);
  const { ranges, unresolved } = evidence;
  const sources = result?.matchedSources || result?.result_data?.matched_sources || [];
  const score = result?.score ?? result?.plagiarism_score ?? result?.result_data?.plagiarism_score;
  const hasScore = validPercentage(score);
  const reportReady = !stale && !pending && !failed && !scanning;
  const peerStatus = !reportReady ? "Awaiting current check" : (result?.peerComparisonEnabled === false || result?.peerSimilarity?.enabled === false)
    ? "Comparison disabled" : !result?.peerSimilarity ? "Not checked" : peers.length
      ? `${peers.length} matching ${peers.length === 1 ? "classmate" : "classmates"}` : "No reportable matches";
  const peerAvailable = reportReady && result?.peerComparisonEnabled !== false
    && result?.peerSimilarity?.enabled !== false && Boolean(result?.peerSimilarity);
  // Use the saved score; older reports only stored individual match percentages.
  const savedPeerScore = result?.peerSimilarity?.peer_similarity_score;
  const peerScore = !peerAvailable ? null : !peers.length ? 0
    : validPercentage(savedPeerScore) ? savedPeerScore
      : peers.reduce((highest, match) => Number(match.score_percent) > Number(highest) ? match.score_percent : highest, peers[0].score_percent);
  return <div role="dialog" aria-modal="true" aria-labelledby="submission-review-title"
    className="wc-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-2 sm:p-4 backdrop-blur-sm">
    <div className="wc-modal-panel review-workspace relative max-h-[94vh] w-full overflow-y-auto overflow-x-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl">
      <div className="review-close-row">
        <button type="button" onClick={onClose} disabled={saving || scanning}
          className="text-sm font-medium text-[#137333] disabled:opacity-50">← Back to submissions</button>
        <button type="button" onClick={onClose} disabled={saving || scanning}
          aria-label="Close submitted work" title="Back to submissions"
          className="classroom-icon disabled:opacity-50 disabled:cursor-not-allowed">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="review-header">
        <div className="min-w-0">
        <h2 id="submission-review-title" className="text-xl font-semibold text-gray-900">{submission.studentName}</h2>
        <p className="mt-1 text-base font-medium text-gray-900">{submission.assignmentTitle}</p>
        <p className="mt-1 text-sm text-gray-600">{submission.classroomName}{submission.classroomSection ? ` · Section ${submission.classroomSection}` : ""}{submission.classroomSubject ? ` · ${submission.classroomSubject}` : ""}</p>
        <p className="mt-1 text-xs text-gray-500">{submission.returnedAt ? "Returned" : submission.grade !== "" && submission.grade != null ? "Graded" : "Turned In"} · {formatDateTime(submission.createdAt)}</p>
        <button type="button" className="similarity-chip mt-3 text-sm" onClick={() => reveal(originalDetails)}>Original submission / download</button>
        </div>
          <section aria-label="Similarity Analysis" className="review-summary">
            <h3 className="sr-only">Similarity Review</h3>
            <div className="review-summary-stats">
              <section aria-label="Online source similarity" className="review-similarity-card">
                <h4>Online Sources</h4>
                {scanning || pending ? <p role="status">Checking similarity...</p>
                  : failed ? <div className="validation-error rounded-lg p-3"><p role="alert">Similarity check failed</p>
                    {submission.processingError && <p>{submission.processingError}</p>}
                    <button type="button" disabled={scanning || saving} onClick={onRecheck} className="mt-2 underline">Retry processing</button></div>
                  : hasScore && !stale && result?.mode !== "classroom" ? <p className="review-score font-bold tracking-tight">{score}%</p>
                  : <p role="status">No similarity result available</p>}
                {reportReady && result && <button type="button" className="review-source-link" aria-haspopup="dialog"
                  onClick={() => openSourceDetails()}>{sources.length} matching {sources.length === 1 ? "source" : "sources"}</button>}
                <button type="button" className="similarity-chip" aria-haspopup="dialog" onClick={() => openSourceDetails()}>View sources</button>
              </section>
              <section aria-label="Peer similarity" className="review-similarity-card">
                <h4>Peer Similarity</h4>
                {peerScore !== null && <p className="review-score font-bold tracking-tight">{peerScore}%</p>}
                <p className="review-peer-status">{peerStatus}</p>
                <p className="review-similarity-note">Same classroom and assignment</p>
                <button type="button" className="similarity-chip" aria-haspopup="dialog" onClick={() => openSourceDetails("peers")}>
                  {reportReady && peers.length ? "View peer matches" : "View peer comparison"}
                </button>
              </section>
            </div>
            <div className="review-summary-actions">
              <a className="similarity-chip review-grade-link" href="#review-grading">Go to grading</a>
            </div>
          </section>
      </div>
      <div className="review-columns mt-5 grid items-start gap-6 ">
        <div className="review-reading-column min-w-0 space-y-6">
          <section aria-label="Extracted Essay" className="min-w-0">
            <div className="review-essay-heading"><h3 className="font-semibold">Essay review</h3>
              {text && <button type="button" onClick={() => onCopy(text)} className="similarity-chip">{copied ? "Copied!" : "Copy text"}</button>}
            </div>
            {reportReady && result?.evidenceStatus === "loading" && <p role="status" className="mb-2 text-sm">Loading matching passages...</p>}
            {reportReady && hasScore && result?.mode !== "classroom" && !ranges.some(r => r.type === "online") && <p className="mb-2 text-sm">Exact matching passages are not available for this result.</p>}
            {!text && <p role={failed ? "alert" : "status"} className="mb-2 text-sm text-gray-600">
              {failed ? "Text extraction did not complete. Use Retry processing in the similarity overview." : pending ? "Text extraction is in progress." : "Extracted text is not available."}
            </p>}
            <EssayEvidence text={text} ranges={ranges} submission={submission} sources={sources} mode={displayMode} onModeChange={setDisplayMode} onOpenSources={openSourceDetails} sourcesAvailable={reportReady && Boolean(result)} />
            {!pending && !failed && <button type="button" onClick={onRecheck} disabled={scanning || saving || !text.trim()} className="similarity-chip mt-2">Re-run Similarity Check</button>}

          </section>
          <details ref={originalDetails} className="review-original">
            <summary>Original submission / download</summary><div className="mt-3">
            {submission.essayTitle && submission.essayTitle !== submission.assignmentTitle && <p className="mb-2 break-words text-sm text-gray-600">{submission.essayTitle}</p>}
            {imageLoading ? <p role="status">Loading original image…</p> : imageUrl ? <>
              <button type="button" onClick={() => onExpandImage(true)} className="block w-full" aria-label="Expand original submission">
                <img src={imageUrl} alt="Student submission" className="max-h-72 w-full rounded-lg object-contain" />
              </button>
              <a href={imageUrl} download className="similarity-chip inline-block my-2">Download original</a>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#137333] underline">View original submission</a>
            </> : <SubmissionFilePreview fileUrl={submission.fileUrl} originalsOnly />}
          </div></details>
        </div>
        <aside id="review-grading" tabIndex={-1} aria-label="Grading" className="review-grading min-w-0 self-start lg:sticky lg:top-12 lg:max-h-[76vh] lg:overflow-y-auto">
          <StatusMessage error={error} message={message} />
          {grading}
        </aside>
      </div>
      <details className="mt-6 border-t border-gray-200 pt-4">
        <summary className="cursor-pointer font-medium text-gray-900">Class and private comments</summary>
        <AssignmentComments assignmentId={submission.assignmentId} classroomId={submission.classroomId} profile={profile} />
      </details>
    </div>
    {sourcesOpen && <SimilarityDialog title="Sources and peer matches" onClose={() => setSourcesOpen(false)}>
            <div className="review-source-content">
              <p className="mb-3 text-sm text-gray-600">Matching content supports your review; it does not establish plagiarism.</p>
          <section aria-label="Online Sources" className="min-w-0 border-t border-gray-200 pt-4">
            <h3 className="font-semibold text-gray-900">Online Sources</h3>
            {!reportReady && <p className="mt-2 text-sm">Source details will be available after a current similarity check.</p>}
            {reportReady && <>
                {unresolved.length > 0 && !stale && <details className="mt-2 text-sm"><summary>Passages without reliable locations</summary>{unresolved.filter(p => p.text !== text).map((p, i) => <blockquote key={i} className="mt-2 whitespace-pre-wrap border-l-2 pl-3">{p.label}: {p.text}</blockquote>)}</details>}
                {peers.length > 0 && !ranges.some(r => r.type === "peer") && <p className="mt-2 text-sm">Exact peer matching passages are unavailable for this transcription.</p>}
                {result && !stale && <div className="mt-3 text-sm">
                  <div className="mt-3 space-y-3 break-words">
                    {result.wordCount != null && <p>Words checked: {result.wordCount}</p>}
                    {result.identicalWords != null && <p>Matched words: {result.identicalWords}</p>}
                    {sources.length > 0 ? <PaginatedList items={sources} resetKey={submission.id} label="Review sources">{rows => rows.map((source, index) => <div key={source.id || index} className="min-w-0 border-b border-gray-200 pb-2">
                      <p className="font-medium">{source.title || "Matched source"}</p>
                      {source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#137333] underline">{source.url}</a>}
                      {(source.matched_words ?? source.identical_words) != null && <p>{source.matched_words ?? source.identical_words} matched words</p>}
                      {validPercentage(source.score_percent) && <p>Match: {source.score_percent}%</p>}
                      {ranges.some(range => range.source === source) && <button type="button" className="similarity-chip" onClick={() => {
                        setSourcesOpen(false);
                        setDisplayMode("all");
                        requestAnimationFrame(() => {
                        const target = document.querySelector(`[data-match-sources~="${sources.indexOf(source)}"]`);
                        target?.scrollIntoView?.({ block: "center", behavior: "smooth" }); target?.focus(); target?.click();
                        });
                      }}>View Match</button>}
                      {source.snippet && source.snippet.trim() !== text.trim() && <blockquote className="whitespace-pre-wrap border-l-2 border-gray-300 pl-3">{source.snippet}</blockquote>}
                    </div>)}</PaginatedList> : <p>No source details were supplied.</p>}
                    {result.summary && result.summary.trim() !== text.trim() && <p>{result.summary}</p>}
                    {result.flags?.map((flag, index) => <p key={index}>{flag}</p>)}
                  </div>
                </div>}
              </>}
          </section>
            <div ref={peerDetails} tabIndex={-1} className="review-peer-details" aria-label="Saved peer comparison">
              {reportReady ? <ClassmateMatches key={submission.id} submission={{ ...submission, scanResult: result }} compact storedMatches={peers} stale={stale} />
                : <section><h3 className="font-semibold">Peer Similarity</h3><p>{peerStatus}</p></section>}
            </div>
            </div>
    </SimilarityDialog>}
    {imageExpanded && imageUrl && <div role="dialog" aria-modal="true" aria-label="Original image" className="wc-modal-backdrop fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 bg-black/85 p-4">
      <button type="button" onClick={() => onExpandImage(false)} className="rounded-lg bg-white px-3 py-2 text-gray-900">Close original image</button>
      <img src={imageUrl} alt="Student submission full view" className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </div>;
}
