import EssayEvidence from "./EssayEvidence";
import { useMemo, useState } from "react";
import { collectEvidence, scopedPeerMatches, staleReport } from "./similarityEvidence";
import SubmissionFilePreview from "./SubmissionFilePreview";
import ClassmateMatches from "./ClassmateMatches";
import AssignmentComments from "./AssignmentComments";
import { PaginatedList } from "./Pagination";
import { formatDateTime, StatusMessage } from "./shared";

export default function SubmissionReview({ submission, submissions = [], profile, text, onTextChange, onSaveText, result, scanning,
  progress, onRecheck, onClose, saving, onCopy, copied, error, message, grading,
  imageUrl, imageLoading, imageExpanded, onExpandImage }) {
  const [editing, setEditing] = useState(false);
  const stale = staleReport({ ...submission, transcribedText: text, scanResult: result });
  const peers = useMemo(() => scopedPeerMatches({ ...submission, scanResult: result }, submissions), [submission, result, submissions]);
  const evidence = useMemo(() => stale ? { ranges: [], unresolved: [] } : collectEvidence(text, result, peers), [text, result, peers, stale]);
  const { ranges, unresolved } = evidence;
  const pending = ["submitted", "processing"].includes(submission.processingState);
  const failed = submission.processingState === "failed";
  const sources = result?.matchedSources || [];
  const score = result?.score;
  const hasScore = score !== null && score !== undefined && score !== "" && Number.isFinite(Number(score));
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
      <div className="review-columns mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
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
          <section aria-label="Extracted Essay" className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="review-transcription" className="text-base font-semibold text-gray-900">Extracted Essay</label>
              {text && <button type="button" onClick={() => onCopy(text)} className="text-sm text-[#137333]">{copied ? "Copied!" : "Copy text"}</button>}
            </div>
            {!text && <p role={failed ? "alert" : "status"} className="mb-2 text-sm text-gray-600">
              {failed ? "Text extraction did not complete. Retry processing below." : pending ? "Text extraction is in progress." : "Extracted text is not available."}
            </p>}
            {editing ? <>
              <textarea id="review-transcription" aria-label="Edit extracted student work" rows={12} value={text} disabled={saving}
                onChange={event => onTextChange(event.target.value)}
                className="w-full max-w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm leading-7 text-gray-900 whitespace-pre-wrap break-words" />
              <div className="mt-2 flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={() => { onTextChange(submission.transcribedText || ""); setEditing(false); }} className="similarity-chip">Cancel</button>
                <button type="button" disabled={saving || !text.trim()} onClick={async () => { if (await onSaveText()) setEditing(false); }} className="similarity-chip">{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </> : <>
              <EssayEvidence text={text} ranges={ranges} submission={submission} />
              {profile?.role === "teacher" && <button type="button" disabled={pending || scanning || saving} onClick={() => setEditing(true)} className="similarity-chip mt-2">Edit Student Work</button>}
            </>}
            {stale && <p role="status" className="mt-2 text-sm">Similarity results were generated before the extracted text was edited. Re-run the check to review the updated work.</p>}
            {!editing && !pending && <button type="button" onClick={onRecheck} disabled={scanning || saving || !text.trim()} className="similarity-chip mt-2">Re-run Similarity Check</button>}

          </section>
          <section aria-label="Similarity Analysis" className="min-w-0 border-t border-gray-200 pt-4">
            <h3 className="font-semibold text-gray-900">Online Source Similarity</h3>
            {scanning || pending ? <p role="status" className="mt-2 text-sm">{progress || "Processing submission…"}</p>
              : failed ? <div className="validation-error mt-2 rounded-lg p-3"><p role="alert">{submission.processingError || "Automated processing could not be completed."}</p>
                <button type="button" disabled={scanning || saving} onClick={onRecheck} className="mt-2 underline">Retry processing</button></div>
              : <>
                <p className="mt-2 text-xl font-semibold">{stale ? "Previous transcription - recheck required" : result?.mode === "classroom" ? "Online: Not checked" : hasScore ? `${score}% Similarity` : "Similarity result not available yet"}</p>
                <p className="mt-1 text-xs text-gray-500">Similarity indicates matching content and does not by itself determine plagiarism.</p>
                {result?.evidenceStatus === "loading" && !stale && <p role="status" className="mt-2 text-sm">Loading saved matching passages...</p>}
                {unresolved.length > 0 && !stale && <details className="mt-2 text-sm"><summary>Passages without reliable locations</summary>{unresolved.filter(p => p.text !== text).map((p, i) => <blockquote key={i} className="mt-2 whitespace-pre-wrap border-l-2 pl-3">{p.label}: {p.text}</blockquote>)}</details>}
                {hasScore && !stale && result?.mode !== "classroom" && !ranges.some(r => r.type === "online") && <p className="mt-2 text-sm">Exact matching passages are not available for this result.</p>}
                {peers.length > 0 && !ranges.some(r => r.type === "peer") && <p className="mt-2 text-sm">Exact peer matching passages are unavailable for this transcription.</p>}
                {result && !stale && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">View similarity details</summary>
                  <div className="mt-3 space-y-3 break-words">
                    {result.provider && <p>Provider: {result.provider}{result.scanId ? ` · Scan ${result.scanId}` : ""}</p>}
                    {result.wordCount != null && <p>Words checked: {result.wordCount}</p>}
                    {result.identicalWords != null && <p>Matched words: {result.identicalWords}</p>}
                    {sources.length > 0 ? <PaginatedList items={sources} resetKey={submission.id} label="Review sources">{rows => rows.map((source, index) => <div key={source.id || index} className="min-w-0 border-b border-gray-200 pb-2">
                      <p className="font-medium">{source.title || "Matched source"}</p>
                      {source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#137333] underline">{source.url}</a>}
                      {(source.matched_words ?? source.identical_words) != null && <p>{source.matched_words ?? source.identical_words} matched words</p>}
                      {source.source_type && <p>{source.source_type}</p>}
                      {source.snippet && source.snippet.trim() !== text.trim() && <blockquote className="whitespace-pre-wrap border-l-2 border-gray-300 pl-3">{source.snippet}</blockquote>}
                    </div>)}</PaginatedList> : <p>No source details were supplied.</p>}
                    {result.summary && result.summary.trim() !== text.trim() && <p>{result.summary}</p>}
                    {result.flags?.map((flag, index) => <p key={index}>{flag}</p>)}
                  </div>
                </details>}
              </>}
          </section>
          <ClassmateMatches key={submission.id} submission={submission} compact storedMatches={peers} stale={stale} />
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
