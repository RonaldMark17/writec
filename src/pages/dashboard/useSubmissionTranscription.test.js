import { act, renderHook, waitFor } from "@testing-library/react";
import useSubmissionTranscription from "./useSubmissionTranscription";
import { extractTextFromImage } from "./ocrService";
import { apiFetch } from "../../apiFetch";

jest.mock("./ocrService", () => ({ extractTextFromImage: jest.fn() }));
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));

beforeEach(() => jest.resetAllMocks());
const picture = (name = "essay.jpg") => new File(["image"], name, { type: "image/jpeg" });

test("streams before submission and retains student corrections without rerunning OCR", async () => {
  let finish;
  extractTextFromImage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const file = picture();
  const { result } = renderHook(() => useSubmissionTranscription(file, "picture"));
  expect(result.current.status).toBe("processing");
  act(() => extractTextFromImage.mock.calls[0][1].onProgress({ text: "First line", detectedLineCount: 2, processedLineCount: 1 }));
  expect(result.current.text).toBe("First line");
  expect(result.current.status).toBe("processing");
  await act(async () => finish({ text: "First line\nSecond line" }));
  expect(result.current.status).toBe("ready");
  act(() => result.current.setText("Reviewed student text"));
  expect(result.current.text).toBe("Reviewed student text");
  expect(extractTextFromImage).toHaveBeenCalledTimes(1);
  expect(apiFetch).not.toHaveBeenCalled();
});

test("replacing a file aborts the old request and ignores its late response", async () => {
  const completions = [];
  extractTextFromImage.mockImplementation(() => new Promise((resolve) => completions.push(resolve)));
  const { result, rerender } = renderHook(({ file }) => useSubmissionTranscription(file, "picture"), { initialProps: { file: picture("first.jpg") } });
  const firstOptions = extractTextFromImage.mock.calls[0][1];
  rerender({ file: picture("second.jpg") });
  expect(firstOptions.signal.aborted).toBe(true);
  await act(async () => completions[0]({ text: "Stale transcript" }));
  expect(result.current.text).toBe("");
  expect(result.current.status).toBe("processing");
  await act(async () => completions[1]({ text: "Current transcript" }));
  expect(result.current.text).toBe("Current transcript");
});

test("failed or truncated OCR cannot become a ready submission and can be retried", async () => {
  extractTextFromImage.mockResolvedValueOnce({ text: "Partial text", truncated: true }).mockResolvedValueOnce({ text: "Complete text" });
  const file = picture();
  const { result } = renderHook(() => useSubmissionTranscription(file, "picture"));
  await waitFor(() => expect(result.current.status).toBe("failed"));
  expect(result.current.error).toMatch(/Some lines were not transcribed/);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.text).toBe("Complete text");
});

test("pasted text does not start OCR", () => {
  renderHook(() => useSubmissionTranscription(null, "text"));
  expect(extractTextFromImage).not.toHaveBeenCalled();
});
