import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export function processingLabel(state) {
  return { submitted: "Submitted", processing: "Processing", ready: "Ready for review", failed: "Processing failed" }[state] || "Submitted";
}

export function applySubmissionResult(row, result, progress, teacher) {
  const visible = teacher || Boolean(result.returned_at);
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
}

export function useSubmissionProgress(userId, setSubmissions, teacher = false) {
  const [syncError, setSyncError] = useState("");
  useEffect(() => {
    if (!userId) return undefined;
    let stopped = false;
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const [results, progress] = await Promise.all([
          supabase.rpc("list_submission_results"), supabase.rpc("submission_processing_status"),
        ]);
        if (results.error || progress.error) throw new Error("Submission updates could not synchronize. Retrying automatically.");
        if (!stopped) {
          const byId = new Map((results.data || []).map((row) => [String(row.id), row]));
          setSubmissions((rows) => rows.map((row) => byId.has(String(row.id))
            ? applySubmissionResult(row, byId.get(String(row.id)), progress.data?.[row.id], teacher) : row));
          setSyncError("");
        }
      } catch (error) {
        if (!stopped) setSyncError(error.message || "Submission updates are unavailable.");
      } finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
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
