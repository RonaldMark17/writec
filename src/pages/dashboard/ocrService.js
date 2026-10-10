import { apiFetch, getBackendUrl } from "../../apiFetch";
import { combinePageText, getUploadLimits, validateEssayPages } from "./essayPages";

function resolveBackendUrl() {
  if (typeof getBackendUrl === "function") {
    try {
      const url = getBackendUrl();
      if (url) return url;
    } catch {
      // ignore
    }
  }
  return process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
}

export function getOcrEndpoint() {
  if (process.env.REACT_APP_OCR_ENDPOINT) {
    return process.env.REACT_APP_OCR_ENDPOINT;
  }
  return `${resolveBackendUrl()}/api/upload`;
}

export function getOcrStreamEndpoint() {
  if (process.env.REACT_APP_OCR_STREAM_ENDPOINT) {
    return process.env.REACT_APP_OCR_STREAM_ENDPOINT;
  }
  return `${resolveBackendUrl()}/api/upload-stream`;
}

const OCR_TIMEOUT_MS = 1200000;

function buildOcrResult(data = {}) {
  return {
    text: data.text || "",
    lines: data.lines ?? [],
    confidences: data.confidences ?? [],
    lineDetails: data.line_details ?? data.lineDetails ?? [],
    boxes: data.boxes ?? [],
    rawBoxes: data.raw_boxes ?? data.rawBoxes ?? [],
    detectedLineCount: data.detected_line_count ?? data.detectedLineCount ?? data.lines?.length ?? 0,
    duplicateLineCount: data.duplicate_line_count ?? data.duplicateLineCount ?? 0,
    processedLineCount: data.processed_line_count ?? data.processedLineCount ?? data.lines?.length ?? 0,
    truncated: Boolean(data.truncated),
  };
}

async function extractTextFromImageJson(file, signal) {
  const formData = new FormData();

  formData.append("file", file, file.name);

  let response;

  const endpoint = getOcrEndpoint();
  try {
    response =
      await apiFetch(endpoint, {
        method: "POST",
        body: formData,
        signal,
      });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "OCR is taking too long on this machine. Try a smaller/clearer image, or run the FastAPI model on a GPU server."
      );
    }

    throw new Error(
      `Could not reach the OCR server at ${endpoint}. Start FastAPI with "uvicorn main:app --reload --port 8000", then try again.`
    );
  }

  if (!response.ok) {
    let message =
      "Image text extraction failed.";

    try {
      const data =
        await response.json();

      message =
        data.detail || data.error || message;
    } catch (error) {
      const text =
        await response.text();

      message =
        text || message;
    }

    throw new Error(message);
  }

  const data =
    await response.json();

  return buildOcrResult(data);
}

async function extractTextFromImageStream(file, signal, onProgress, local = false) {
  const backend = resolveBackendUrl();
  const endpoint = local
    ? `${backend}/local-ocr/upload-stream`
    : getOcrStreamEndpoint();
  const formData = new FormData();

  formData.append("file", file, file.name);

  let response;

  try {
    response =
      await (local ? fetch : apiFetch)(endpoint, {
        method: "POST",
        body: formData,
        signal,
      });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "OCR is taking too long on this machine. Try a smaller/clearer image, or run the FastAPI model on a GPU server."
      );
    }

    throw new Error(
      `Could not reach the OCR server at ${endpoint}. Start it with "npm run start:backend", then try again.`
    );
  }

  if (!response.ok || !response.body) {
    if (!response.body) {
      if (local) throw new Error("This browser did not provide a transcription stream. Please retry in a current browser.");
      return extractTextFromImageJson(file, signal);
    }

    let message =
      "Image text extraction failed.";

    try {
      const data =
        await response.json();

      message =
        data.detail || data.error || message;
    } catch (error) {
      const text =
        await response.text();

      message =
        text || message;
    }

    throw new Error(message);
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let latestResult = buildOcrResult();
  let completed = false;

  const handleEvent = (event) => {
    if (event.type === "error") {
      throw new Error(event.detail || "Image text extraction failed.");
    }

    if (event.type === "metadata") {
      latestResult = {
        ...latestResult,
        rawBoxes: event.raw_boxes ?? [],
        detectedLineCount: event.detected_line_count ?? 0,
        duplicateLineCount: event.duplicate_line_count ?? 0,
        processedLineCount: event.processed_line_count ?? 0,
        truncated: Boolean(event.truncated),
      };
      onProgress?.(latestResult);
      return;
    }

    if (event.type === "lines") {
      latestResult = {
        ...latestResult,
        text: event.text || "",
        lines: latestResult.lines.concat(event.lines ?? []),
        confidences: latestResult.confidences.concat(event.confidences ?? []),
        boxes: latestResult.boxes.concat(event.boxes ?? []),
        rawBoxes: event.raw_boxes ?? latestResult.rawBoxes,
        detectedLineCount: event.detected_line_count ?? latestResult.detectedLineCount,
        duplicateLineCount: event.duplicate_line_count ?? latestResult.duplicateLineCount,
        processedLineCount: event.processed_line_count ?? latestResult.processedLineCount,
        truncated: Boolean(event.truncated),
      };
      onProgress?.(latestResult);
      return;
    }

    if (event.type === "done") {
      completed = true;
      latestResult = buildOcrResult(event);
      onProgress?.(latestResult);
    }
  };

  while (true) {
    const { done, value } =
      await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines =
      buffer.split("\n");

    buffer =
      lines.pop() ?? "";

    for (const line of lines) {
      const cleanLine =
        line.trim();

      if (!cleanLine) {
        continue;
      }

      handleEvent(JSON.parse(cleanLine));
    }
  }

  if (buffer.trim()) {
    handleEvent(JSON.parse(buffer.trim()));
  }

  if (!completed) {
    throw new Error("Transcription stopped before completion. Check that the OCR backend is still running and try again.");
  }
  return latestResult;
}

export async function extractTextFromImage(file, options = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timeoutId =
    window.setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    if (options.onProgress) {
      return await extractTextFromImageStream(
        file,
        controller.signal,
        options.onProgress,
        options.local
      );
    }

    return await extractTextFromImageJson(file, controller.signal);
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export async function getOcrEngineInfo() {
  try {
    const backend = getBackendUrl();
    const response = await apiFetch(`${backend}/api/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function extractTextFromImages(files, options = {}) {
  validateEssayPages(files, await getUploadLimits());
  if (files.length > 1) return extractPageStream(files, options);
  const pages = [];
  for (let index = 0; index < files.length; index++) {
    if (options.signal?.aborted) throw new Error("Transcription cancelled.");
    const file = files[index];
    const pageNumber = index + 1;
    try {
      options.onProgress?.({ pageNumber, pageCount: files.length, phase: "Detecting text lines", pages: [...pages], text: "" });
      const result = await extractTextFromImage(file, { ...options,
          onProgress: progress => options.onProgress?.({ ...progress, pageNumber, pageCount: files.length, phase: "Transcribing", pages: [...pages] }),
        });
        if (result.truncated || !result.text?.trim()) throw new Error(result.truncated ? "Some lines were not transcribed. Retry with complete OCR settings." : "No text was recognized. Try a clearer image.");
      pages.push({ ...result, page_number: pageNumber, name: file.name, status: "ready" });
    } catch (error) {
      throw new Error(`Page ${pageNumber} could not be processed. ${error.message} Please retry this page.`);
    }
  }
  options.onProgress?.({ pageNumber: files.length, pageCount: files.length, phase: "Combining essay", pages, text: "" });
  return { text: combinePageText(pages), pages, lines: pages.flatMap(page => page.lines || []),
    boxes: [], rawBoxes: [], truncated: false,
    detectedLineCount: pages.reduce((sum, page) => sum + (page.detectedLineCount || 0), 0),
    processedLineCount: pages.reduce((sum, page) => sum + (page.processedLineCount || 0), 0) };
}

async function extractPageStream(files, options) {
  const form = new FormData();
  files.forEach(file => form.append("files", file));
  const response = await apiFetch(`${resolveBackendUrl()}/api/upload-pages-stream`, {
    method: "POST", body: form, signal: options.signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(typeof error.detail === "string" ? error.detail : "The essay pages could not be uploaded.");
  }
  if (!response.body) throw new Error("The transcription stream is unavailable. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", result;
  const event = data => {
    if (data.type === "error") throw new Error(data.detail);
    if (data.type === "done") {
      if (data.pages?.length !== files.length) throw new Error("Not all essay pages finished transcription.");
      result = { ...buildOcrResult(data), pages: [...data.pages].sort((a, b) => a.page_number - b.page_number), text: combinePageText(data.pages) };
    } else {
      options.onProgress?.({ ...buildOcrResult(data), pageNumber: data.page_number, pageCount: data.page_count, phase: data.phase });
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.filter(line => line.trim()).forEach(line => event(JSON.parse(line)));
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(JSON.parse(buffer));
    if (!result) throw new Error("Transcription stopped before every page finished. Please retry.");
    return result;
  } finally { reader.releaseLock?.(); }
}

