import { applySubmissionResult, processingLabel } from "./submissionProgress";

test("unreleased results are cleared even if the client previously displayed a returned grade", () => {
  const row = { id: "s", grade: "90", scanResult: { score: 30 } };
  const privateResult = { status: "graded", grade: "80", feedback: "private", transcribed_text: "private", scan_result: { score: 50 } };
  const result = applySubmissionResult(row, privateResult, { state: "ready", error: "private" }, false);
  expect(result.status).toBe("graded");
  expect(result.grade).toBe("");
  expect(result.feedback).toBe("");
  expect(result.transcribedText).toBe("");
  expect(result.scanResult).toBeNull();
  expect(result.processingError).toBeNull();
});

test("released zero grades and teacher drafts are preserved", () => {
  expect(applySubmissionResult({}, { grade: 0, returned_at: "now" }, {}, false).grade).toBe(0);
  expect(applySubmissionResult({}, { grade: "75" }, {}, true).grade).toBe("75");
});

test("processing states have distinct labels", () => {
  expect(["submitted", "processing", "ready", "failed"].map(processingLabel)).toEqual([
    "Submitted", "Processing", "Ready for review", "Processing failed",
  ]);
});
