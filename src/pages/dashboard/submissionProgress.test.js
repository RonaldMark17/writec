import { applySubmissionResult, mergeSubmissionResults, processingLabel } from "./submissionProgress";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useSubmissionProgress } from "./submissionProgress";
import { supabase } from "../../supabaseClient";
import { apiFetch } from "../../apiFetch";

jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));

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

test("new uploads appear without reloading and receive saved teacher results", () => {
  const result = { id: "new", student_id: "student", classroom_id: "class", assignment_id: "assignment",
    essay_title: "Essay", file_url: "student/essay.txt", transcribed_text: "Original text", scan_result: { score: 42 } };
  const context = { members: [{ studentId: "student", classroomId: "class", studentName: "Alex" }],
    assignments: [{ id: "assignment", title: "Homework", classroomName: "English" }] };
  const rows = mergeSubmissionResults([], [result], { new: { state: "ready" } }, true, context);
  expect(rows[0]).toMatchObject({ studentName: "Alex", assignmentTitle: "Homework", fileUrl: "student/essay.txt",
    processingState: "ready", transcribedText: "Original text", scanResult: { score: 42 } });
  expect(mergeSubmissionResults(rows, [result], { new: { state: "ready" } }, true, context)).toHaveLength(1);
});

test("polling removes submissions that are no longer accessible and masks new private results", () => {
  const rows = mergeSubmissionResults([{ id: "old" }], [{ id: "new", transcribed_text: "private", scan_result: { score: 42 } }], {}, false);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: "new", transcribedText: "", scanResult: null });
});

test("dashboard polling discovers a submission then refreshes its finished report", async () => {
  jest.useFakeTimers();
  let ready = false;
  apiFetch.mockImplementation(async () => ({ ok: true, json: async () => ({
    results: [{ id: "new", file_url: "essay.txt", scan_result: ready ? { score: 25 } : null }],
    progress: { new: { state: ready ? "ready" : "processing" } },
  }) }));
  const { result, unmount } = renderHook(() => {
    const [rows, setRows] = useState([]);
    useSubmissionProgress("teacher", setRows, true);
    return rows;
  });
  await act(async () => {});
  expect(result.current[0]).toMatchObject({ id: "new", fileUrl: "essay.txt", processingState: "processing", scanResult: null });
  ready = true;
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(result.current[0]).toMatchObject({ processingState: "ready", scanResult: { score: 25 } });
  unmount();
  jest.useRealTimers();
});

test("teacher sees the zero-credit explanation instead of an unexplained missing API result", async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [], progress: {}, provider: { credits: 0 } }) });
  const update = jest.fn();
  const { result, unmount } = renderHook(() => useSubmissionProgress("teacher", update, true));
  await act(async () => {});
  expect(result.current).toMatch(/0 available credits/);
  unmount();
});
