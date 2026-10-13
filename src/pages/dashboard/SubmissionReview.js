import EssayEvidence from "./EssayEvidence";
import { useMemo, useState } from "react";
import { collectEvidence, scopedPeerMatches, staleReport, validPercentage } from "./similarityEvidence";
import SubmissionFilePreview from "./SubmissionFilePreview";
import ClassmateMatches from "./ClassmateMatches";
import AssignmentComments from "./AssignmentComments";
import { PaginatedList } from "./Pagination";
import { formatDateTime, StatusMessage } from "./shared";

export default function SubmissionReview({ submission, submissions = [], profile, text, result, scanning,
  progress, onRecheck, onClose, saving, onCopy, copied, error, message, grading,
  imageUrl, imageLoading, imageExpanded, onExpandImage, ocrEngineInfo }) {
  const [displayMode, setDisplayMode] = useState("all");
  const modelName = value => typeof value === "string" ? value.split(/[\\/]/).filter(Boolean).pop() : null;
  const engineLabel = [modelName(ocrEngineInfo?.yolo_model), modelName(ocrEngineInfo?.trocr_model)].filter(Boolean).join(" + ");
  const stale = staleReport({ ...submission, transcribedText: text, scanResult: result });
  const peers = useMemo(() => scopedPeerMatches({ ...submission, scanResult: result }, submissions), [submission, result, submissions]);
  const pending = ["submitted", "processing"].includes(submission.processingState);
  const failed = submission.processingState === "failed";
  const evidence = useMemo(() => stale || pending || failed || scanning ? { ranges: [], unresolved: [] } : collectEvidence(text, result, peers), [text, result, peers, stale, pending, failed, scanning]);
  const { ranges, unresolved } = evidence;
  const sources = result?.matchedSources || result?.result_data?.matched_sources || [];
  const score = result?.score ?? result?.plagiarism_score ?? result?.result_data?.plagiarism_score;
  const hasScore = validPercentage(score);
  return <div role="dialog" aria-modal="true" aria-labelledby="submission-review-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-2 sm:p-4 backdrop-blur-sm">
    <div className="review-workspace relative max-h-[94vh] w-full max-w-6xl overflow-y-auto overflow-x-hidden rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl">
      <div className="border-b border-gray-200 pb-4">
        <button type="button" onClick={onClose} disabled={saving || scanning}
          className="mb-3 text-sm font-medium text-[#137333] disabled:opacity-50">← Back to submissions</button>
        <h2 id="submission-review-title" className="text-xl font-semibold text-gray-900">{submission.studentName}</h2>
        <p className="mt-1 text-base font-medium text-gray-900">{submission.assignmentTitle}</p>
        <p className="mt-1 text-sm text-gray-600">{submission.classroomName}{submission.classroomSection ? ` · Section ${submission.classroomSection}` : ""}{submission.classroomSubject ? ` · ${submission.classroomSubject}` : ""}</p>
        <p className="mt-1 text-xs text-gray-500">{submission.returnedAt ? "Returned" : submission.grade !== "" && submission.grade != null ? "Graded" : "Turned In"} · {formatDateTime(submission.createdAt)}</p>
      </div>
      <div className="review-columns mt-5 grid items-start gap-6 ">
        <div className="min-w-0 space-y-6">
          <section aria-label="Submitted Work" className="min-w-0">
            <h3 className="mb-3 text-base font-semibold text-gray-900">Submitted Work</h3>
            {submission.essayTitle && submission.essayTitle !== submission.assignmentTitle && <p className="mb-2 break-words text-sm text-gray-600">{submission.essayTitle}</p>}
            {imageLoading ? <p role="status">Loading original image…</p> : imageUrl ? <>
              <button type="button" onClick={() => onExpandImage(true)} className="block w-full" aria-label="Expand original submission">
                <img src={imageUrl} alt="Student submission" className="max-h-72 w-full rounded-lg object-contain" />
              </button>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#137333] underline">View original submission</a>
            </> : <SubmissionFilePreview fileUrl={submission.fileUrl} originalsOnly />}
          </section>
          <section aria-label="Similarity Analysis" className="min-w-0 border-t border-gray-200 pt-4">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">Transcribed student handwriting {engineLabel && <span className="similarity-chip ml-2 inline-block text-xs">{engineLabel}</span>}</h3>
              {text && <button type="button" onClick={() => onCopy(text)} className="text-sm text-[#137333]">{copied ? "Copied!" : "Copy text"}</button>}
            </div>
            <h3 className="font-semibold text-gray-900">Plagiarism / Similarity Report</h3>
            <p className="mt-1 text-sm">Online Source Similarity</p>
            {scanning || pending ? <p role="status" className="mt-4">Checking similarity...</p>
              : failed ? <div className="validation-error mt-2 rounded-lg p-3"><p role="alert">Similarity check failed</p>
                {submission.processingError && <p>{submission.processingError}</p>}
                <button type="button" disabled={scanning || saving} onClick={onRecheck} className="mt-2 underline">Retry processing</button></div>
              : hasScore && !stale && result?.mode !== "classroom" ? <p className="my-5 text-center"><span className="block text-6xl font-bold tracking-tight">{score}%</span><span className="mt-2 block text-sm">Similarity</span></p>
              : <p role="status" className="mt-4">No similarity result available</p>}
            <p className="mt-2 text-sm text-gray-500">Similarity represents matching content identified by the plagiarism-detection service and should be reviewed by the instructor.</p>
          </section>
          <section aria-label="Extracted Essay" className="min-w-0">
            {!text && <p role={failed ? "alert" : "status"} className="mb-2 text-sm text-gray-600">
              {failed ? "Text extraction did not complete. Retry processing below." : pending ? "Text extraction is in progress." : "Extracted text is not available."}
            </p>}
            <EssayEvidence text={text} ranges={ranges} submission={submission} sources={sources} mode={displayMode} onModeChange={setDisplayMode} />
            {!pending && !failed && <button type="button" onClick={onRecheck} disabled={scanning || saving || !text.trim()} className="similarity-chip mt-2">Re-run Similarity Check</button>}

          </section>
          <ClassmateMatches key={submission.id} submission={{ ...submission, scanResult: result }} compact storedMatches={peers} stale={stale} />
          <section aria-label="Online Sources" className="min-w-0 border-t border-gray-200 pt-4">
            <h3 className="font-semibold text-gray-900">Online Sources</h3>
            {!scanning && !pending && !failed && <>
                {result?.evidenceStatus === "loading" && !stale && <p role="status" className="mt-2 text-sm">Loading matching passages...</p>}
                {unresolved.length > 0 && !stale && <details className="mt-2 text-sm"><summary>Passages without reliable locations</summary>{unresolved.filter(p => p.text !== text).map((p, i) => <blockquote key={i} className="mt-2 whitespace-pre-wrap border-l-2 pl-3">{p.label}: {p.text}</blockquote>)}</details>}
                {hasScore && !stale && result?.mode !== "classroom" && !ranges.some(r => r.type === "online") && <p className="mt-2 text-sm">Exact matching passages are not available for this result.</p>}
                {peers.length > 0 && !ranges.some(r => r.type === "peer") && <p className="mt-2 text-sm">Exact peer matching passages are unavailable for this transcription.</p>}
                {result && !stale && <div className="mt-3 text-sm">
                  <div className="mt-3 space-y-3 break-words">
                    {result.provider && <p>Provider: {result.provider}{result.scanId ? ` · Scan ${result.scanId}` : ""}</p>}
                    {result.wordCount != null && <p>Words checked: {result.wordCount}</p>}
                    {result.identicalWords != null && <p>Matched words: {result.identicalWords}</p>}
                    {sources.length > 0 ? <PaginatedList items={sources} resetKey={submission.id} label="Review sources">{rows => rows.map((source, index) => <div key={source.id || index} className="min-w-0 border-b border-gray-200 pb-2">
                      <p className="font-medium">{source.title || "Matched source"}</p>
                      {source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#137333] underline">{source.url}</a>}
                      {(source.matched_words ?? source.identical_words) != null && <p>{source.matched_words ?? source.identical_words} matched words</p>}
                      {source.source_type && <p>{source.source_type}</p>}
                      {validPercentage(source.score_percent) && <p>Match: {source.score_percent}%</p>}
                      {ranges.some(range => range.source === source) && <button type="button" className="similarity-chip" onClick={() => {
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
        </div>
        <aside aria-label="Grading" className="review-grading min-w-0 self-start lg:sticky lg:top-4 lg:max-h-[84vh] lg:overflow-y-auto">
          <StatusMessage error={error} message={message} />
          {grading}
        </aside>
      </div>
      <details className="mt-6 border-t border-gray-200 pt-4">
        <summary className="cursor-pointer font-medium text-gray-900">Class and private comments</summary>
        <AssignmentComments assignmentId={submission.assignmentId} classroomId={submission.classroomId} profile={profile} />
      </details>
    </div>
    {imageExpanded && imageUrl && <div role="dialog" aria-modal="true" aria-label="Original image" className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 bg-black/85 p-4">
      <button type="button" onClick={() => onExpandImage(false)} className="rounded-lg bg-white px-3 py-2 text-gray-900">Close original image</button>
      <img src={imageUrl} alt="Student submission full view" className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </div>;
}
