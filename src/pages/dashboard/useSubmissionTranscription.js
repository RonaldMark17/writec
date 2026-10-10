import { useEffect, useState } from "react";
import { apiFetch, getBackendUrl } from "../../apiFetch";
import { extractTextFromImage, extractTextFromImages } from "./ocrService";
import { combinePageText, getUploadLimits, isEssayImage, validateEssayPages } from "./essayPages";

const empty = { file: null, status: "idle", text: "", error: "", progress: null };

export default function useSubmissionTranscription(file, mode) {
  const [state, setState] = useState(empty);
  const [attempt, setAttempt] = useState(0);
  const [requested, setRequested] = useState(null);
  useEffect(() => {
    if (!file || mode === "text") { setState(empty); setRequested(null); return undefined; }
    if (Array.isArray(file) && requested !== file) { setState({ ...empty, file, status: "waiting" }); return undefined; }
    const controller = new AbortController();
    let cancelled = false;
    setState({ ...empty, file, status: "processing" });
    async function run() {
      try {
        if (Array.isArray(file)) {
          const result = await extractTextFromImages(file, { signal: controller.signal,
            onProgress: progress => { if (!cancelled) setState({ ...empty, file, status: "processing", progress, pages: progress.pages }); },
          });
          if (!cancelled) setState({ ...empty, ...result, file, status: "ready" });
          return;
        }
        if (!file.size || (!isEssayImage(file) && file.size > 25 * 1024 * 1024)) throw new Error("Choose a nonempty file up to 25 MB.");
        let text;
        if (file.type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) {
          if (!isEssayImage(file)) throw new Error("Choose a supported image format.");
          validateEssayPages([file], await getUploadLimits());
          const result = await extractTextFromImage(file, {
            signal: controller.signal,
            onProgress: (progress) => {
              if (!cancelled) setState({ file, status: "processing", text: progress.text || "", progress, error: "" });
            },
          });
          if (result.truncated) throw new Error("Some lines were not transcribed. Ask your teacher to check the OCR settings, then retry.");
          text = result.text;
        } else if (/\.(pdf|docx)$/i.test(file.name)) {
          const form = new FormData();
          form.append("file", file);
          const backendUrl = typeof getBackendUrl === "function" ? getBackendUrl() : (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000");
          const response = await apiFetch(`${backendUrl}/api/documents/extract`, {
            method: "POST", body: form, signal: controller.signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "The document could not be read.");
          text = result.text;
        } else if (/\.(txt|md|csv|json)$/i.test(file.name)) {
          text = await file.text();
        } else {
          throw new Error("Choose an image, PDF, DOCX, or text file.");
        }
        if (!text?.trim()) throw new Error("No text was recognized. Choose a clearer image or paste your essay instead.");
        if (!cancelled) setState((previous) => ({ ...previous, file, status: "ready", text, error: "" }));
      } catch (error) {
        if (!cancelled) setState((previous) => ({ ...previous, file, status: "failed", error: error.message || "Transcription failed. Please retry." }));
      }
    }
    run();
    return () => { cancelled = true; controller.abort(); };
  }, [file, mode, attempt, requested]);

  // A new selection must never submit the previous file's transcript, including
  // the render before the effect has started the next request.
  const current = state.file === file ? state : { ...empty, file, status: Array.isArray(file) ? "waiting" : file ? "processing" : "idle" };
  return { ...current,
    start: () => setRequested(file),
    setPageText: (index, text) => setState(previous => {
      if (previous.file !== file || previous.status !== "ready") return previous;
      const pages = previous.pages.map((page, i) => i === index ? { ...page, text } : page);
      return { ...previous, pages, text: pages.some(page => !page.text.trim()) ? "" : combinePageText(pages) };
    }),
    setText: (text) => setState((previous) => previous.file === file && previous.status === "ready" ? { ...previous, text } : previous),
    retry: () => setAttempt((value) => value + 1),
  };
}
