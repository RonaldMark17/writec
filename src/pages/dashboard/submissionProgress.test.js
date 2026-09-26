import { applySubmissionResult, processingLabel } from "./submissionProgress";

test("unreleased results are cleared even if the client previously displayed a returned grade", () => {
  const row = { id: "s", grade: "90", scanResult: { score: 30 } };
  const privateResult = { status: "graded", grade: "80", feedback: "private", transcribed_text: "private", scan_result: { score: 50 } };
  const result = applySubmissionResult(row, privateResult, { state: "ready", error: "private" }, false);
  expect(result.status).toBe("graded");
  expect(result.grade).toBe("");
  expect(result.feedback).toBe("");
  expect(result.transcribedText).toBe("private");
  expect(result.scanResult).toBeNull();
  expect(result.processingError).toBeNull();
  expect(result.hasUploaded).toBe(true);
  expect(result.hasPlagiarismChecked).toBe(true);
});

test("released zero grades and teacher drafts are preserved", () => {
  expect(applySubmissionResult({}, { grade: 0, returned_at: "now" }, {}, false).grade).toBe(0);
  expect(applySubmissionResult({}, { grade: "75" }, {}, true).grade).toBe("75");
});

test("plagiarism scan results are never visible to students even when work is returned", () => {
  const released = {
    status: "graded",
    grade: "95",
    feedback: "Well written",
    returned_at: "2026-09-26T10:00:00Z",
    transcribed_text: "Student handwritten essay digital transcript",
    scan_result: { score: 14.5, label: "Low review", matchedSources: [] },
  };

  const studentResult = applySubmissionResult({}, released, { state: "ready" }, false);
  expect(studentResult.grade).toBe("95");
  expect(studentResult.feedback).toBe("Well written");
  expect(studentResult.transcribedText).toBe("Student handwritten essay digital transcript");
  expect(studentResult.scanResult).toBeNull();
  expect(studentResult.hasUploaded).toBe(true);
  expect(studentResult.hasTranscribed).toBe(true);
  expect(studentResult.hasRecorded).toBe(true);
  expect(studentResult.hasPlagiarismChecked).toBe(true);

  const teacherResult = applySubmissionResult({}, released, { state: "ready" }, true);
  expect(teacherResult.scanResult).toEqual(released.scan_result);
});

test("processing states have distinct labels", () => {
  expect(["submitted", "processing", "ready", "failed"].map(processingLabel)).toEqual([
    "Submitted", "Processing", "Ready for review", "Processing failed",
  ]);
});
