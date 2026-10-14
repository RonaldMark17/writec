import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { checkPeerSimilarityViaBackend } from "./plagiarismScan";
import { formatDateTime } from "./shared";

export function SimilarityDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  function keys(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex="0"]')]
      .filter(node => !node.closest('[hidden]') && ![...node.closest('section').querySelectorAll('details:not([open])')].some(details => details.contains(node) && node !== details.querySelector('summary')));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
      event.preventDefault(); first.focus();
    }
  }
  return createPortal(<div className="wc-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={keys}
      className="wc-modal-panel review-evidence-dialog max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[#dadce0] bg-white p-5 text-[#202124] shadow-xl outline-none">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-lg border border-[#dadce0] px-4 py-2 text-sm">Close</button>
      </div>
      {children}
    </section>
  </div>, document.body);
}

// Match only server-provided consecutive word sequences, preserving original text offsets.
export function phraseRanges(text, phrase) {
  const tokens = [...text.matchAll(/\b[a-z0-9']+\b/gi)];
  const words = phrase.toLowerCase().match(/\b[a-z0-9']+\b/g) || [];
  if (words.length < 4) return [];
  const ranges = [];
  const positions = new Map(); let offset = 0;
  tokens.forEach((token, index) => { positions.set(offset, index); offset += token[0].length + 1; });
  const normalized = ` ${tokens.map(token => token[0].toLowerCase()).join(" ")} `;
  const needle = ` ${words.join(" ")} `;
  for (let match = normalized.indexOf(needle); match !== -1; match = normalized.indexOf(needle, match + 1)) {
    const first = positions.get(match), last = tokens[first + words.length - 1];
    const selected = tokens.slice(first, first + words.length);
    // Do not paint over unrecognized words between normalized tokens.
    if (selected.some((token, index) => index && /[\p{L}\p{N}]/u.test(text.slice(selected[index - 1].index + selected[index - 1][0].length, token.index)))) continue;
    ranges.push([tokens[first].index, last.index + last[0].length]);
  }
  return ranges;
}

function EvidenceText({ text, phrases }) {
  const ranges = phrases.flatMap(phrase => phraseRanges(text, phrase)).sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(range => {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  });
  const parts = []; let end = 0;
  merged.forEach(([start, stop]) => {
    parts.push(text.slice(end, start), <mark key={start} className="rounded bg-amber-100 text-amber-900">{text.slice(start, stop)}</mark>);
    end = stop;
  });
  parts.push(text.slice(end));
  return <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7" tabIndex={0}>{text ? parts : "No saved answer available."}</div>;
}

export function PeerComparison({ submission, matchedSubmissionId }) {
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  const { id, classroomId, assignmentId } = submission;
  useEffect(() => {
    let cancelled = false;
    setState({});
    checkPeerSimilarityViaBackend({ submissionId: id, classroomId, assignmentId, matchedSubmissionId })
      .then(data => { if (!cancelled) setState({ data }); })
      .catch(error => { if (!cancelled) setState({ error: error.message }); });
    return () => { cancelled = true; };
  }, [id, classroomId, assignmentId, matchedSubmissionId, attempt]);
  if (state.error) return <p role="alert">{state.error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Retry inspection</button></p>;
  const data = state.data;
  if (!data) return <p role="status">Loading saved answers...</p>;
  if (data.enabled === false) return <p>Classroom comparison is disabled in your profile.</p>;
  const phrases = (Array.isArray(data.matching_snippets) ? data.matching_snippets : []).filter(phrase => typeof phrase === "string"
    && phraseRanges(data.left.text, phrase).length && phraseRanges(data.right.text, phrase).length);
  return <div className="space-y-4">
    <div className="text-sm">
      <p>Assignment: {data.assignment_title}</p>
      <p>Classroom: {data.classroom_name}{data.subject && data.subject !== "No subject" && data.subject !== data.classroom_name ? ` / ${data.subject}` : ""}</p>
      <p className="mt-2 font-semibold">Similarity: {data.score_percent}%</p>
      <p>Similarity supports teacher review; it does not establish plagiarism.</p>
      {!phrases.length && <p className="mt-2">Exact matching passages are unavailable. Both complete saved answers are shown without highlights.</p>}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {[data.left, data.right].map((answer, index) => <section key={answer.submission_id} aria-label={`Student ${index === 0 ? "A" : "B"} answer`}
        className="min-w-0 space-y-3 rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-4">
        <h3 className="font-semibold">{answer.student_name}</h3>
        <p className="text-xs text-[#5f6368]">Submitted: {answer.submitted_at ? formatDateTime(answer.submitted_at) : "Not available"}</p>
        <p className="text-xs text-[#5f6368]">Status: {answer.status || "Not available"}</p>
        <EvidenceText text={answer.text} phrases={phrases} />
      </section>)}
    </div>
  </div>;
}
