import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { apiFetch } from "../../apiFetch";
import { accountRequest } from "../../accountRequest";

export async function loadTeacherSubmissionStatus() {
  return accountRequest(async (signal) => {
    const response = await apiFetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api/submissions/status`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to verify API results.");
    if (!Array.isArray(data.results) || !data.progress) throw new Error("The backend returned an incomplete submission status.");
    return data;
  });
}

export function processingLabel(state) {
  return { submitted: "Submitted", processing: "Processing", ready: "Ready for review", failed: "Processing failed" }[state] || "Submitted";
}

export function applySubmissionResult(row, result, progress, teacher) {
  const visible = teacher || Boolean(result.returned_at);
<<<<<<< HEAD
  const state = progress?.state || (result.scan_result ? "ready" : "submitted");
  return { ...row, status: result.status, returnedAt: result.returned_at,
    grade: visible ? (result.grade ?? "") : "",
    feedback: visible ? (result.feedback ?? "") : "",
    transcribedText: visible ? (result.transcribed_text ?? "") : "",
    scanResult: visible && state === "ready" ? (result.scan_result ?? null) : null,
    processingState: state, processingError: teacher ? progress?.error : null };
=======
  const isReady = (progress?.state === "ready") || Boolean(result.scan_result) || Boolean(result.transcribed_text);
  return {
    ...row,
    status: result.status,
    returnedAt: result.returned_at,
    grade: visible ? (result.grade ?? "") : "",
    feedback: visible ? (result.feedback ?? "") : "",
    transcribedText: teacher ? (result.transcribed_text ?? "") : (isReady ? (result.transcribed_text ?? "") : ""),
    scanResult: teacher ? (result.scan_result ?? null) : null,
    processingState: progress?.state || (isReady ? "ready" : "submitted"),
    processingError: teacher ? progress?.error : null,
    hasUploaded: true,
    hasTranscribed: isReady || Boolean(result.transcribed_text),
    hasRecorded: isReady || Boolean(result.transcribed_text),
    hasPlagiarismChecked: isReady || Boolean(result.scan_result),
  };
>>>>>>> 619429dd5297a5135620ece977f2fc62ed704a75
}

export function mergeSubmissionResults(rows, results, progress, teacher, context = {}) {
  const previous = new Map(rows.map((row) => [String(row.id), row]));
  return results.map((result) => {
    const row = previous.get(String(result.id)) || {};
    const assignment = context.assignments?.find((item) => String(item.id) === String(result.assignment_id));
    const member = context.members?.find((item) => String(item.studentId) === String(result.student_id)
      && String(item.classroomId) === String(result.classroom_id));
    return applySubmissionResult({
      ...row, id: result.id, createdAt: result.created_at,
      assignmentId: result.assignment_id, classroomId: result.classroom_id,
      studentId: result.student_id, essayTitle: result.essay_title,
      fileUrl: result.file_url,
      studentName: member?.studentName || row.studentName || "Student",
      assignmentTitle: assignment?.title || row.assignmentTitle || "Assignment",
      classroomName: assignment?.classroomName || row.classroomName || "Classroom",
    }, result, progress?.[result.id], teacher);
  });
}

export function useSubmissionProgress(userId, setSubmissions, teacher = false, context = {}) {
  const [syncError, setSyncError] = useState("");
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => {
    if (!userId) return undefined;
    let stopped = false;
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        if (teacher) {
          const { results, progress, provider } = await loadTeacherSubmissionStatus();
          if (!stopped) {
            setSubmissions((rows) => mergeSubmissionResults(rows, results, progress, true, contextRef.current));
            setSyncError(provider?.credits === 0
              ? "Copyleaks has 0 available credits. Saved essays remain available, but a genuine API check needs credits before you retry."
              : "");
          }
          return;
        }
        const [results, progress] = await Promise.all([
          supabase.rpc("list_submission_results"), supabase.rpc("submission_processing_status"),
        ]);
        if (results.error || progress.error) throw new Error("Submission updates could not synchronize. Retrying automatically.");
        if (!stopped) {
          setSubmissions((rows) => mergeSubmissionResults(rows, results.data || [], progress.data, teacher, contextRef.current));
          setSyncError("");
        }
      } catch (error) {
        if (!stopped) setSyncError(error.message || "Submission updates are unavailable.");
      } finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, setSubmissions, teacher]);
  return syncError;
}
