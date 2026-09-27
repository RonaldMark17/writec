import { readTextFromFiles } from "./plagiarismScan";
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
