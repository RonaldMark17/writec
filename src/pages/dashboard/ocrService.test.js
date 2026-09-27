import { extractTextFromImage } from "./ocrService";
import { apiFetch } from "../../apiFetch";

jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));

function streamResponse(events) {
  let sent = false;
  return { ok: true, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true };
    sent = true;
    return { done: false, value: events.map(JSON.stringify).join("\n") + "\n" };
  } }) } };
}

beforeEach(() => {
  global.TextDecoder = class { decode(value) { return value; } };
  global.fetch = jest.fn();
  jest.clearAllMocks();
});

test("local model preview streams text without waiting for account authentication", async () => {
  fetch.mockResolvedValue(streamResponse([
    { type: "metadata", detected_line_count: 1 },
    { type: "lines", text: "My handwritten essay", lines: ["My handwritten essay"], processed_line_count: 1 },
    { type: "done", text: "My handwritten essay", lines: ["My handwritten essay"], processed_line_count: 1 },
  ]));
  const progress = jest.fn();
  const result = await extractTextFromImage(new File(["image"], "essay.jpg"), { local: true, onProgress: progress });
  expect(result.text).toBe("My handwritten essay");
  expect(progress).toHaveBeenCalledTimes(3);
  expect(apiFetch).not.toHaveBeenCalled();
  expect(fetch.mock.calls[0][0]).toMatch(/\/local-ocr\/upload-stream$/);
});

test("classroom OCR still uses account authentication", async () => {
  apiFetch.mockResolvedValue(streamResponse([{ type: "done", text: "Essay" }]));
  await extractTextFromImage(new File(["image"], "essay.jpg"), { onProgress: jest.fn() });
  expect(apiFetch).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test("interrupted streams fail instead of reporting an incomplete transcript as complete", async () => {
  fetch.mockResolvedValue(streamResponse([{ type: "metadata", detected_line_count: 2 }]));
  await expect(extractTextFromImage(new File(["image"], "essay.jpg"), { local: true, onProgress: jest.fn() }))
    .rejects.toThrow("Transcription stopped before completion");
});

test("local preview does not fall back to account-protected OCR when streaming is unavailable", async () => {
  fetch.mockResolvedValue({ ok: true, body: null });
  await expect(extractTextFromImage(new File(["image"], "essay.jpg"), { local: true, onProgress: jest.fn() }))
    .rejects.toThrow("did not provide a transcription stream");
  expect(apiFetch).not.toHaveBeenCalled();
});
