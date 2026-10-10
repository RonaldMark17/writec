import { act, fireEvent, render, screen } from "@testing-library/react";
import EssayPagePicker from "./EssayPagePicker";
import { combinePageText, validateEssayPages } from "./essayPages";
import { extractTextFromImages } from "./ocrService";
import { apiFetch } from "../../apiFetch";

jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn(), getBackendUrl: () => "http://localhost:8000" }));
const file = name => new File(["image"], name, { type: "image/png" });
const ready = (page_number, text) => ({ page_number, text, status: "ready" });
function stream(events) {
  let sent = false;
  return { ok: true, body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: events.map(JSON.stringify).join("\n") + "\n" }), releaseLock: jest.fn() }) } };
}
beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:page"); URL.revokeObjectURL = jest.fn();
  global.TextDecoder = class { decode(value) { return value || ""; } };
  apiFetch.mockImplementation(async () => ({ ok: false }));
});

test("combining out-of-order results uses explicit page numbers and preserves wording", () => {
  expect(combinePageText([ready(3, "End"), ready(1, "my Words,\nparagraph"), ready(2, "continuation")]))
    .toBe("my Words,\nparagraph\ncontinuation\nEnd");
  expect(() => combinePageText([ready(1, "Start"), { page_number: 2, status: "failed" }])).toThrow(/Every numbered page/);
  expect(() => combinePageText([ready(1, "Start"), ready(1, "Duplicate")])).toThrow();
});

test("size, total, page count, and unsupported formats are rejected", () => {
  const image = { name: "page.png", type: "image/png", size: 11 * 1024 ** 2 };
  expect(() => validateEssayPages([image])).toThrow(/10 MB/);
  expect(() => validateEssayPages(Array.from({ length: 6 }, () => ({ ...image, size: 9 * 1024 ** 2 })))).toThrow(/50 MB/);
  expect(() => validateEssayPages(Array.from({ length: 21 }, () => file("page.png")))).toThrow(/20 pages/);
  expect(() => validateEssayPages([file("bad.svg")])).toThrow(/images only/);
});

test("numbered previews can be reordered, replaced and removed", async () => {
  const files = [file("z.png"), file("a.png"), file("m.png")];
  const changed = jest.fn();
  render(<EssayPagePicker files={files} onChange={changed} />);
  await act(async () => {});
  expect(screen.getAllByRole("img")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Move page 3 up" }));
  expect(changed).toHaveBeenLastCalledWith([files[0], files[2], files[1]]);
  fireEvent.click(screen.getByRole("button", { name: "Remove page 2" }));
  expect(changed).toHaveBeenLastCalledWith([files[0], files[2]]);
  const replacement = file("replace.png");
  fireEvent.change(screen.getByLabelText("Replace page 2"), { target: { files: [replacement] } });
  expect(changed).toHaveBeenLastCalledWith([files[0], replacement, files[2]]);
});

test("batch upload uses displayed file order and one complete result", async () => {
  const files = [file("z.png"), file("a.png"), file("m.png")];
  apiFetch.mockImplementation(async url => url.endsWith("upload-limits") ? { ok: false } : stream([
    { type: "page", page_number: 1, page_count: 3, phase: "Detecting text lines" },
    { type: "done", pages: [ready(3, "End"), ready(1, "Start"), ready(2, "Continue")] },
  ]));
  const progress = jest.fn();
  const result = await extractTextFromImages(files, { onProgress: progress });
  expect(apiFetch.mock.calls[1][1].body.getAll("files")).toEqual(files);
  expect(result.text).toBe("Start\nContinue\nEnd");
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 1, pageCount: 3 }));
});

test.each([
  [{ type: "error", detail: "Page 2 could not be processed." }],
  [{ type: "page", page_number: 1, page_count: 2 }],
  [{ type: "done", pages: [ready(1, "Only first page")] }],
])("failure, disconnected stream, or missing pages never returns an essay", async event => {
  apiFetch.mockImplementation(async url => url.endsWith("upload-limits") ? { ok: false } : stream([event]));
  await expect(extractTextFromImages([file("1.png"), file("2.png")])).rejects.toThrow();
});
