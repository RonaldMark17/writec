import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../supabaseClient";
import { formatDateTime } from "./shared";

export default function DeleteAssignmentDialog({ assignment, onClose, onDeleted }) {
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const panel = useRef(null);
  const cancel = useRef(null);
  const heading = useId();
  const input = useId();
  const warning = useId();
  const canDelete = preview && title.trim() === preview.title && acknowledged && !busy;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setError("");
    supabase.rpc("assignment_deletion_preview", {
      assignment_key: String(assignment.id), classroom_key: String(assignment.classroomId),
    }).then(({ data, error: failure }) => {
      if (!live) return;
      if (failure || !data || String(data.id) !== String(assignment.id)
        || String(data.classroomId) !== String(assignment.classroomId) || !data.title) {
        setError(failure?.message || "Could not verify this assignment. Close and try again.");
      } else setPreview(data);
    }).catch(() => { if (live) setError("Could not verify this assignment. Please try again."); });
    return () => { live = false; };
  }, [assignment.id, assignment.classroomId, attempt]);

  function close() { if (!inFlight.current) onClose(); }
  function keys(event) {
    event.stopPropagation();
    // No implicit submission, including Enter while the final action is focused.
    if (event.key === "Enter") { event.preventDefault(); return; }
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...panel.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); panel.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
      event.preventDefault(); first.focus();
    }
  }
  async function remove() {
    if (!canDelete || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    panel.current?.focus();
    let result;
    try {
      result = await supabase.rpc("delete_assignment_confirmed", {
        assignment_key: String(assignment.id), classroom_key: String(assignment.classroomId),
        confirmation_title: title.trim(), acknowledged,
      });
      if (result.error || result.data?.deleted !== true || String(result.data.id) !== String(assignment.id)
        || String(result.data.classroomId) !== String(assignment.classroomId)) {
        throw new Error(result.error?.message || "The server did not confirm deletion. Refresh to check the assignment before retrying.");
      }
    } catch (failure) {
      setError(`Assignment deletion could not be confirmed. ${failure.message || "Please refresh and try again."}`);
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // Refresh failures must never be reported as deletion failures after commit.
    await onDeleted(result.data);
  }

  const details = preview || assignment;
  return createPortal(<div className="wc-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={heading} aria-describedby={warning}
      aria-busy={busy} tabIndex={-1} onKeyDownCapture={keys}
      className="wc-modal-panel w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-gray-300 bg-white p-5 text-gray-900 shadow-xl">
      <h2 id={heading} className="text-xl font-semibold">Delete assignment?</h2>
      <dl className="my-4 space-y-2 break-words text-sm">
        <div><dt>Assignment</dt><dd className="font-semibold">{details.title}</dd></div>
        <div><dt>Class</dt><dd>{details.classroomName}</dd></div>
        <div><dt>Section</dt><dd>{details.classroomSection || "Not specified"}</dd></div>
        {details.dueDate && <div><dt>Due date</dt><dd>{formatDateTime(details.dueDate)}</dd></div>}
      </dl>
      {preview ? <p className="mb-4 text-sm">{preview.students} enrolled students · {preview.submissions} submissions · {preview.graded} graded submissions · {preview.comments} comments</p>
        : !error && <p role="status">Verifying assignment and related records…</p>}
      <div id={warning} className="validation-error rounded-lg border p-3 text-sm">
        <p>This permanently deletes the assignment, its submissions, grades, feedback, comments, revision history, processing results, and notifications. This action cannot be undone.</p>
        <p className="mt-2">Original files and standalone scan history are retained. The classroom, enrolled students, and other assignments are kept.</p>
      </div>
      <label htmlFor={input} className="mt-4 block text-sm">To confirm, type the exact assignment title: <strong className="break-words">{details.title}</strong></label>
      <input id={input} value={title} onChange={event => setTitle(event.target.value)} disabled={busy || !preview}
        autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy || !preview} className="mt-1" />
        I understand that deleting this assignment may remove its related student work, grades, comments, and associated records.
      </label>
      {error && <p role="alert" className="validation-error mt-4 rounded-lg p-3 text-sm">{error}</p>}
      {!preview && error && <button type="button" onClick={() => setAttempt(value => value + 1)} className="similarity-chip mt-2">Retry verification</button>}
      {busy && <p role="status" className="mt-4">Deleting assignment…</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button ref={cancel} type="button" disabled={busy} onClick={close} className="similarity-chip min-h-11 px-4 py-2 font-semibold disabled:opacity-50">Cancel</button>
        <button type="button" disabled={!canDelete} onClick={remove}
          className="validation-error min-h-11 rounded-lg border px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Permanently delete assignment</button>
      </div>
    </section>
  </div>, document.body);
}
