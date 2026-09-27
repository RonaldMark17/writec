import { readTextFromFiles, pollPlagiarismScanResult } from "./plagiarismScan";
import { apiFetch } from "../../apiFetch";

jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("./ocrService", () => ({ extractTextFromImage: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test.each(["pdf", "docx"])("extracts %s contents on the backend before a manual check", async (extension) => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ text: "The actual document text" }) });
  const file = new File(["binary"], `essay.${extension}`);
  const result = await readTextFromFiles([file]);
  expect(result.text).toBe("The actual document text");
  expect(result.unreadableFiles).toEqual([]);
  expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("/api/documents/extract"), expect.objectContaining({ method: "POST" }));
});

test("extraction failure stops the check instead of scanning binary file content", async () => {
  apiFetch.mockResolvedValue({ ok: false, json: async () => ({ detail: "Unreadable PDF" }) });
  await expect(readTextFromFiles([new File(["bad pdf"], "essay.pdf")])).rejects.toThrow("Unreadable PDF");
});


test("pending scans at the polling deadline never become completed reports", async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ status: "processing" }) });
  await expect(pollPlagiarismScanResult("scan", { maxAttempts: 1, intervalMs: 0 })).rejects.toThrow("timed out");
});

test("failed scans preserve the server error", async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ status: "failed", error_message: "Run a new Copyleaks check." }) });
  await expect(pollPlagiarismScanResult("scan", { maxAttempts: 1, intervalMs: 0 })).rejects.toThrow("Run a new Copyleaks check.");
});

test("completed scans preserve zero scores and empty provider matches", async () => {
  const scan = { status: "completed", plagiarism_score: 0, result_data: { provider: "copyleaks", matched_sources: [] } };
  apiFetch.mockResolvedValue({ ok: true, json: async () => scan });
  await expect(pollPlagiarismScanResult("scan", { maxAttempts: 1, intervalMs: 0 })).resolves.toEqual(scan);
});
