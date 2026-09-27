import { apiFetch, getBackendUrl } from "../../apiFetch";

export function getOcrEndpoint() {
  if (process.env.REACT_APP_OCR_ENDPOINT) {
    return process.env.REACT_APP_OCR_ENDPOINT;
  }
  const backend = getBackendUrl();
  return `${backend}/api/upload`;
}

export function getOcrStreamEndpoint() {
  if (process.env.REACT_APP_OCR_STREAM_ENDPOINT) {
    return process.env.REACT_APP_OCR_STREAM_ENDPOINT;
  }
  const backend = getBackendUrl();
  return `${backend}/api/upload-stream`;
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
  const endpoint = local
    ? `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/local-ocr/upload-stream`
    : OCR_STREAM_ENDPOINT;
  const formData = new FormData();

  formData.append("file", file, file.name);

  let response;

  const streamEndpoint = getOcrStreamEndpoint();
  try {
    response =
<<<<<<< HEAD
      await (local ? fetch : apiFetch)(endpoint, {
=======
      await apiFetch(streamEndpoint, {
>>>>>>> 619429dd5297a5135620ece977f2fc62ed704a75
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
<<<<<<< HEAD
      `Could not reach the OCR server at ${endpoint}. Start it with "npm run start:backend", then try again.`
=======
      `Could not reach the OCR server at ${streamEndpoint}. Start FastAPI with "uvicorn main:app --reload --port 8000", then try again.`
>>>>>>> 619429dd5297a5135620ece977f2fc62ed704a75
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
<<<<<<< HEAD
    const backend = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
    const response = await fetch(`${backend}/health`);
=======
    const backend = getBackendUrl();
    const response = await apiFetch(`${backend}/api/health`);
>>>>>>> 619429dd5297a5135620ece977f2fc62ed704a75
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

