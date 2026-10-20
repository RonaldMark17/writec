import { apiFetch } from "../apiFetch";
jest.mock("../apiFetch", () => ({ ...jest.requireActual("../apiFetch"), apiFetch: jest.fn() }));
import { checkPeerSimilarityViaBackend, checkPlagiarismViaBackend, pollPlagiarismScanResult } from "./dashboard/plagiarismScan";
import { extractTextFromImages } from "./dashboard/ocrService";
jest.mock("./dashboard/plagiarismScan", () => ({ ...jest.requireActual("./dashboard/plagiarismScan"), checkPeerSimilarityViaBackend: jest.fn(), checkPlagiarismViaBackend: jest.fn(), pollPlagiarismScanResult: jest.fn() }));
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { loadTeacherSubmissionStatus } from "./dashboard/submissionProgress";
import TeacherDashboard from "./TeacherDashboard";
import { supabase } from "../supabaseClient";
import { downloadGrades } from "./dashboard/gradeExport";
jest.mock("./dashboard/gradeExport", () => ({ ...jest.requireActual("./dashboard/gradeExport"), downloadGrades: jest.fn(async () => {}) }));
jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock("./dashboard/ocrService", () => ({ getOcrEngineInfo: async () => null, extractTextFromImages: jest.fn() }));
jest.mock("./dashboard/submissionProgress", () => ({ ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: (_id, update) => { mockProgressUpdate = update; return ""; },
  loadTeacherSubmissionStatus: jest.fn(async () => ({ results: [], progress: {} })) }));
jest.mock("./dashboard/shared", () => ({ ...jest.requireActual("./dashboard/shared"), Header: ({ onPageChange, notifications }) => <>{notifications}
  <button onClick={() => onPageChange("upload")}>Scan tab</button><button onClick={() => onPageChange("classrooms")}>Classes tab</button><button onClick={() => onPageChange("assignments")}>Classwork tab</button><button onClick={() => onPageChange("submissions")}>Grades tab</button></> }));
let mockProgressUpdate;
let archived = false;
let extraAssignments = [];
let deletedAssignments = new Set();
let notificationRows = [];
let onArchiveUpdate;

test("create classroom identifies blank name and section without writing", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Classes tab"));
  fireEvent.click(screen.getByRole("button", { name: "Create class" }));
  const name = screen.getByLabelText(/Classroom name \(required\)/);
  fireEvent.change(name, { target: { value: "   " } });
  supabase.from.mockClear();
  fireEvent.submit(name.closest("form"));
  expect(screen.getByText("Classroom name is required.")).toBeInTheDocument();
  expect(screen.getByText("Section is required.")).toBeInTheDocument();
  expect(name).toHaveFocus();
  expect(supabase.from).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: "CSST 106" } });
  expect(screen.queryByText("Classroom name is required.")).not.toBeInTheDocument();
});

test("confirmed rename updates the classroom header and classwork context", async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "A", classroom_name: "Renamed classroom", classroom_code: "A" }) });
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Classroom Name" }));
  fireEvent.change(screen.getByLabelText("Classroom name"), { target: { value: "Renamed classroom" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await screen.findByText("Classroom name updated successfully.");
  expect(screen.getByRole("heading", { name: "Renamed classroom" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Classwork tab"));
  fireEvent.click(screen.getAllByText("Essay A")[0]);
  expect(screen.getAllByText(/Renamed classroom/).length).toBeGreaterThan(0);
  await screen.findAllByText("No comments yet.");
});
beforeEach(() => {
  window.scrollTo = jest.fn();
  apiFetch.mockReset().mockResolvedValue({ok:true,json:async()=>({})});
  downloadGrades.mockClear();
  checkPeerSimilarityViaBackend.mockResolvedValue({ total_peers_compared: 0, all_matches: [] });
  archived = false;
  extraAssignments = [];
  deletedAssignments = new Set();
  notificationRows = [];
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [], progress: {} });
  supabase.channel.mockImplementation(() => { const channel = { on: (type, filter, callback) => { onArchiveUpdate = callback; return channel; }, subscribe: () => channel }; return channel; });
  sessionStorage.clear(); window.history.replaceState({}, "", "/");
  supabase.rpc.mockResolvedValue({ data: [] });
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomTable" ? ["A", "B"].map(id => ({ id, teacher_id: "t", teacher_name: "Teacher", classroom_name: `Class ${id}`, classroom_code: id, is_archived: archived && id === "B" }))
      : table === "assignmentTable" ? ["A", "B"].map(id => ({ id: `essay${id}`, classroom_id: id, teacher_id: "t", title: `Essay ${id}` })).concat(extraAssignments).filter(row => !deletedAssignments.has(row.id)) : table === "notifications" ? notificationRows : [];
    const query = { then: resolve => Promise.resolve({ data, count: data.length }).then(resolve) };
    ["select", "eq", "in", "order", "update", "range"].forEach(name => { query[name] = () => query; });
    return query;
  });
});

test("opened assignment exports immediately using its classroom and only its grades", async () => {
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "export_classroom_grades"
    ? [{ assignmentId: "essayA", student: "Alex", score: "90" }, { assignmentId: "essayB", student: "Other", score: "95" }] : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByText("Classwork tab"));
  fireEvent.click(screen.getAllByText("Essay A")[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Export Grades" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenCalledWith([{ assignmentId: "essayA", student: "Alex", score: 90 }], "Teacher", "Class A / Essay A");
  expect(screen.queryByText("Open a classroom or select one classroom before exporting grades.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Grades tab"));
  expect(screen.getByLabelText("Classroom:")).toHaveValue("A");
  expect(screen.getByLabelText("Assignment:")).toHaveValue("essayA");
  expect(screen.getByRole("heading", { name: "Essay A" })).toBeInTheDocument();
  await screen.findAllByText("No comments yet.");
});

test("Grades warns without context but exports a selected assignment without a classroom filter", async () => {
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "export_classroom_grades"
    ? [{ assignmentId: "essayA", student: "Alex", score: "90" }, { assignmentId: "essayB", student: "Other", score: "95" }] : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Open a classroom or select one classroom before exporting grades.");
  expect(downloadGrades).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayB" } });
  expect(screen.getByLabelText("Classroom:")).toHaveValue("B");
  expect(screen.getByRole("heading", { name: "Essay B" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Export grades/i })).toHaveLength(1);
  expect(screen.queryByText("Switch:")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Subject:")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenCalledWith([{ assignmentId: "essayB", student: "Other", score: 95 }], "Teacher", "Class B / Essay B");
});

test("Grades keeps one toolbar and immediately switches assignment work and export scope", async () => {
  extraAssignments = [{ id: "essayA2", classroom_id: "A", teacher_id: "t", title: "Second essay", instructions: "Explain your reasoning." }];
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [
    { id: "work1", assignment_id: "essayA", classroom_id: "A", student_id: "s1", essay_title: "First student work", file_url: "s1/essayA/file.pdf", grade: "91" },
    { id: "work2", assignment_id: "essayA2", classroom_id: "A", student_id: "s2", essay_title: "Second student work", file_url: "s2/essayA2/file.pdf", grade: "82" },
    { id: "foreign", assignment_id: "essayB", classroom_id: "B", student_id: "s3", essay_title: "Foreign work", grade: "100" },
  ], progress: {} });
  const gradeRows = [{ assignmentId: "essayA", student: "First", score: "91" },
    { assignmentId: "essayA2", student: "Second", score: "82" }, { assignmentId: "essayB", student: "Foreign", score: "100" }];
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "export_classroom_grades" ? gradeRows : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.change(screen.getByLabelText("Classroom:"), { target: { value: "A" } });
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayA" } });
  expect(screen.getByRole("heading", { name: "Essay A" })).toBeInTheDocument();
  expect(screen.getByText("First student work")).toBeInTheDocument();
  expect(screen.queryByText("Second student work")).not.toBeInTheDocument();
  expect(screen.getAllByRole("combobox", { name: "Classroom:" })).toHaveLength(1);
  expect(screen.getAllByRole("combobox", { name: "Assignment:" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Back to Classwork" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Edit assignment" })).toHaveLength(1);
  // Only the main selector option and the assignment card carry this context.
  expect(screen.getAllByText("Class A", { exact: true }).filter(node => node.tagName !== "OPTION")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenLastCalledWith([{ ...gradeRows[0], score: 91 }], "Teacher", "Class A / Essay A");

  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayA2" } });
  expect(screen.getByRole("heading", { name: "Second essay" })).toBeInTheDocument();
  expect(screen.getByText("Second student work")).toBeInTheDocument();
  expect(screen.queryByText("First student work")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenLastCalledWith([{ ...gradeRows[1], score: 82 }], "Teacher", "Class A / Second essay");
  fireEvent.click(screen.getByRole("button", { name: "Instructions" }));
  expect(screen.getByText("Explain your reasoning.")).toBeInTheDocument();
  expect(screen.getByText("100 points")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "all" } });
  expect(screen.queryByRole("heading", { name: "Second essay", level: 1 })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Exported 2 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenLastCalledWith([
    { ...gradeRows[0], score: 91 }, { ...gradeRows[1], score: 82 },
  ], "Teacher", "Class A");

  fireEvent.change(screen.getByLabelText("Classroom:"), { target: { value: "B" } });
  expect(screen.getByLabelText("Assignment:")).toHaveValue("all");
  expect(within(screen.getByLabelText("Assignment:")).queryByRole("option", { name: "Essay A" })).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("Assignment:")).getByRole("option", { name: "Essay B" })).toBeInTheDocument();
});

test("opening a Grades card synchronizes the sole assignment selector and export", async () => {
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "export_classroom_grades"
    ? [{ assignmentId: "essayA", student: "Alex", score: "90" }] : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.click(screen.getAllByText("Essay A").find(node => node.tagName !== "OPTION"));
  expect(screen.getByLabelText("Classroom:")).toHaveValue("A");
  expect(screen.getByLabelText("Assignment:")).toHaveValue("essayA");
  fireEvent.click(screen.getByRole("button", { name: "Export grades (.xlsx)" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenCalledWith([{ assignmentId: "essayA", student: "Alex", score: 90 }], "Teacher", "Class A / Essay A");
});

test("classroom export keeps classroom context without selecting an assignment", async () => {
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "export_classroom_grades"
    ? [{ assignmentId: "essayA", student: "Alex", score: "0" }, { assignmentId: "essayB", student: "Other", score: "95" }] : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
  await screen.findByText("Exported 1 student assignment records to Excel.");
  expect(downloadGrades).toHaveBeenCalledWith([{ assignmentId: "essayA", student: "Alex", score: 0 }], "Teacher", "Class A");
});

test("opened classroom persists into Classwork and Grades; manual switching updates the context", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByText("Classwork tab"));
  expect(screen.getByLabelText("Section:")).toHaveValue("A");
  expect(screen.getAllByText("Essay A").length).toBeGreaterThan(0);
  expect(screen.queryByText("Essay B")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Section:"), { target: { value: "B" } });
  expect(screen.getAllByText("Essay B").length).toBeGreaterThan(0);
  expect(screen.queryByText("Essay A")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Grades tab"));
  expect(screen.getByLabelText("Classroom:")).toHaveValue("B");
  fireEvent.change(screen.getByLabelText("Classroom:"), { target: { value: "A" } });
  expect(within(screen.getByLabelText("Assignment:")).getByRole("option", { name: /Essay A/ })).toBeInTheDocument();
  expect(within(screen.getByLabelText("Assignment:")).queryByRole("option", { name: /Essay B/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Classwork tab"));
  expect(screen.getByLabelText("Section:")).toHaveValue("A");
  fireEvent.click(screen.getByText("Classes tab"));
  fireEvent.click(screen.getByRole("button", { name: /Back to classes/ }));
  expect(screen.queryByRole("button", { name: /Archived classes/ })).not.toBeInTheDocument();
});


test("teacher archive menu disappears immediately after the final realtime restore", async () => {
  archived = true;
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: /Archived classes/ }));
  expect(screen.getByRole("button", { name: "Class B" })).toBeInTheDocument();
  act(() => onArchiveUpdate({ new: { id: "B", is_archived: false } }));
  expect(screen.queryByRole("button", { name: /Archived classes/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Class A" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Class B" })).toBeInTheDocument();
});


test("teacher requests a revision with instructions from the review dialog", async () => {
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [{ id: "work", assignment_id: "essayA", classroom_id: "A", student_id: "s", essay_title: "Original essay", status: "submitted", transcribed_text: "Original writing" }], progress: { work: { state: "ready" } } });
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByText("Classwork tab"));
  fireEvent.click(screen.getAllByText("Essay A")[0]);
  fireEvent.click(await screen.findByRole("button", { name: /Review & Grade/ }));
  fireEvent.change(screen.getByPlaceholderText("Leave remarks or suggestions for the student..."), { target: { value: "Add evidence to your conclusion." } });
  fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
  await screen.findByText(/Revision requested. The student can submit updated work/);
  expect(supabase.rpc).toHaveBeenCalledWith("request_submission_revision", { submission_key: "work", instructions: "Add evidence to your conclusion." });
});

test("resubmission notification refreshes and opens the exact teacher review", async () => {
  const savedWork = { id: "workB", assignment_id: "essayB", classroom_id: "B", student_id: "s", essay_title: "Revised B", status: "submitted", transcribed_text: "New writing for B" };
  notificationRows = [{ id: "noticeB", type: "submission_resubmitted", title: "Assignment resubmitted", message: "Review revised B",
    classroom_id: "B", assignment_id: "essayB", submission_id: "workB", metadata: {}, is_read: false, created_at: "2026-10-14" }];
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  // Work arrives after the dashboard's original load.
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [savedWork], progress: { workB: { state: "ready" } } });
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  fireEvent.click(await screen.findByRole("button", { name: /Assignment resubmitted Review revised B/ }));
  await screen.findByPlaceholderText("Leave remarks or suggestions for the student...");
  expect(screen.getAllByText("Revised B").length).toBeGreaterThan(0);
  expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_read", { notification_key: "noticeB" });
  fireEvent.change(screen.getByPlaceholderText("Leave remarks or suggestions for the student..."), { target: { value: "Improve B" } });
  fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("request_submission_revision", { submission_key: "workB", instructions: "Improve B" }));
});


test("closing peer inspection preserves assignment, classroom, roster filter and page", async () => {
  loadTeacherSubmissionStatus.mockResolvedValue({ results: Array.from({ length: 12 }, (_, i) => ({
    id: `work${i}`, assignment_id: "essayA", classroom_id: "A", student_id: `s${i}`,
    essay_title: `Saved work ${i}`, status: "submitted", transcribed_text: "Saved answer"
  })), progress: {} });
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayA" } });
  fireEvent.click(await screen.findByRole("button", { name: "Submitted (12)" }));
  const pagination = screen.getByRole("navigation", { name: "Assignment submissions pagination" });
  fireEvent.click(within(pagination).getByRole("button", { name: "Next" }));
  const filterClass = screen.getByRole("button", { name: "Submitted (12)" }).className;
  fireEvent.click(screen.getAllByRole("button", { name: "Peer similarity" })[0]);
  const dialog = screen.getByRole("dialog");
  await within(dialog).findByText(/No classmate matches/);
  fireEvent.click(within(dialog).getByRole("button", { name: /Close/ }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Classroom:")).toHaveValue("A");
  expect(screen.getByLabelText("Assignment:")).toHaveValue("essayA");
  expect(within(pagination).getByText("Page 2 of 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submitted (12)" }).className).toBe(filterClass);
});

test("Grades follows newly opened classrooms and drops foreign assignment state", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Class A" }));
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayA" } });
  for (const id of ["B", "A", "B"]) {
    fireEvent.click(screen.getByText("Classes tab"));
    fireEvent.click(screen.getByRole("button", { name: /Back to classes/ }));
    fireEvent.click(screen.getByRole("button", { name: `Class ${id}` }));
    fireEvent.click(screen.getByText("Grades tab"));
    expect(screen.getByLabelText("Classroom:")).toHaveValue(id);
    expect(screen.getByLabelText("Assignment:")).toHaveValue("all");
    expect(within(screen.getByLabelText("Assignment:")).getByRole("option", { name: `Essay ${id}` })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Assignment:")).queryByRole("option", { name: `Essay ${id === "A" ? "B" : "A"}` })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: `essay${id}` } });
  }
  await screen.findAllByText("No comments yet.");
});

test("Scan Station offers assignment linking and retains upload and clear actions", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.getByRole("combobox", {name:"Link assignment"})).toHaveValue("all");
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Upload station" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear station" }));
  expect(screen.getByRole("heading", { name: "Upload station" })).toBeInTheDocument();
});

test.each([false, true])("teacher scans one ordered essay only when all pages finish (failure=%s)", async (fail) => {
  checkPlagiarismViaBackend.mockClear();
  extractTextFromImages.mockClear();
  URL.createObjectURL = jest.fn(() => "blob:page"); URL.revokeObjectURL = jest.fn();
  let complete, reject;
  extractTextFromImages.mockImplementation(() => new Promise((resolve, failure) => { complete = resolve; reject = failure; }));
  checkPlagiarismViaBackend.mockResolvedValue({ scan_id: "scan" });
  pollPlagiarismScanResult.mockResolvedValue({ status: "completed", plagiarism_score: 0, result_data: { provider: "copyleaks" } });
  const { container } = render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Scan tab"));
  fireEvent.click(screen.getByRole("button", { name: "Picture" }));
  const files = ["z", "a", "m"].map(name => new File(["image"], `${name}.jpg`, { type: "image/jpeg" }));
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } });
  fireEvent.click(screen.getByRole("button", { name: "Move page 3 up" }));
  fireEvent.click(screen.getByRole("button", { name: "Scan for plagiarism" }));
  await waitFor(() => expect(extractTextFromImages).toHaveBeenCalledTimes(1));
  expect(extractTextFromImages.mock.calls[0][0]).toEqual([files[0], files[2], files[1]]);
  expect(checkPlagiarismViaBackend).not.toHaveBeenCalled();
  if (fail) {
    await act(async () => reject(new Error("Page 2 could not be processed.")));
    expect(screen.getByText("Page 2 could not be processed.")).toBeInTheDocument();
    expect(checkPlagiarismViaBackend).not.toHaveBeenCalled();
  } else {
    const pages = ["The first page", "The continuation", "The conclusion"].map((text, i) => ({ page_number: i + 1, text, status: "ready" }));
    const text = pages.map(page => page.text).join("\n");
    await act(async () => complete({ text, pages }));
    expect(checkPlagiarismViaBackend).toHaveBeenCalledTimes(1);
    expect(checkPlagiarismViaBackend.mock.calls[0][0].text).toBe(text);
  }
});

async function openSavedReview() {
  fireEvent.click(screen.getByText("Grades tab"));
  await screen.findByRole("option", {name:/^Essay A/});
  fireEvent.change(screen.getByLabelText("Assignment:"), {target:{value:"essayA"}});
  fireEvent.click(await screen.findByRole("button", {name:/^Review(?: & Grade)?$/}));
  await screen.findByText("Not checked");
  return screen.getByRole("dialog");
}

test("review grade saves once, preserves drafts across disclosures, reloads and returns saved work", async () => {
  const record = {id:"work",assignment_id:"essayA",classroom_id:"A",student_id:"s",essay_title:"Original",transcribed_text:"Canonical essay",grade:"",feedback:"",status:"submitted"};
  loadTeacherSubmissionStatus.mockResolvedValue({results:[record],progress:{work:{state:"ready"}}});
  let view = render(<TeacherDashboard profile={{id:"t",role:"teacher",full_name:"Teacher"}}/>);
  let dialog = await openSavedReview();
  fireEvent.change(within(dialog).getByLabelText("Grade / Score"), {target:{value:"85"}});
  fireEvent.change(within(dialog).getByLabelText("Teacher Feedback (optional)"), {target:{value:"Good evidence"}});
  fireEvent.click(within(dialog).getByText("Class and private comments"));
  expect(within(dialog).getByLabelText("Teacher Feedback (optional)")).toHaveValue("Good evidence");
  let resolveSave;
  apiFetch.mockImplementation(url => url.endsWith("/grade") ? new Promise(resolve => {resolveSave = resolve;}) : Promise.resolve({ok:true,json:async()=>({})}));
  const button = within(dialog).getByRole("button", {name:"Save Grade"});
  fireEvent.click(button);
  fireEvent.submit(button.closest("form"));
  expect(apiFetch.mock.calls.filter(([url]) => url.endsWith("/grade"))).toHaveLength(1);
  expect(within(dialog).getByRole("button", {name:"Saving grade..."})).toBeDisabled();
  const saved = {...record,grade:"85",feedback:"Good evidence",status:"graded"};
  await act(async () => resolveSave({ok:true,json:async()=>({success:true,grade_record:saved})}));
  expect(await within(dialog).findByText(/Grade saved for/)).toBeInTheDocument();
  view.unmount();
  loadTeacherSubmissionStatus.mockResolvedValue({results:[saved],progress:{work:{state:"ready"}}});
  view = render(<TeacherDashboard profile={{id:"t",role:"teacher",full_name:"Teacher"}}/>);
  dialog = await openSavedReview();
  expect(within(dialog).getByLabelText("Grade / Score")).toHaveValue("85");
  expect(within(dialog).getByLabelText("Teacher Feedback (optional)")).toHaveValue("Good evidence");
  apiFetch.mockResolvedValue({ok:true,json:async()=>({success:true,grade_record:saved})});
  supabase.rpc.mockImplementation(name => Promise.resolve({data:name === "return_submission" ? {returned_at:"2026-10-11T02:00:00Z"} : []}));
  fireEvent.click(within(dialog).getByRole("button", {name:"Return work"}));
  await within(dialog).findByText(/Work returned/);
  expect(supabase.rpc).toHaveBeenCalledWith("return_submission", {submission_key:"work"});
});

test("failed grade save leaves feedback and grade intact", async () => {
  loadTeacherSubmissionStatus.mockResolvedValue({results:[{id:"work",assignment_id:"essayA",classroom_id:"A",student_id:"s",transcribed_text:"Essay",grade:""}],progress:{work:{state:"ready"}}});
  render(<TeacherDashboard profile={{id:"t",role:"teacher",full_name:"Teacher"}}/>);
  const dialog = await openSavedReview();
  fireEvent.change(within(dialog).getByLabelText("Grade / Score"), {target:{value:"88"}});
  fireEvent.change(within(dialog).getByLabelText("Teacher Feedback (optional)"), {target:{value:"Keep this feedback"}});
  apiFetch.mockResolvedValue({ok:false,json:async()=>({detail:"Grade could not be saved. Please try again."})});
  fireEvent.click(within(dialog).getByRole("button", {name:"Save Grade"}));
  await within(dialog).findByText("Grade could not be saved. Please try again.");
  expect(within(dialog).getByLabelText("Grade / Score")).toHaveValue("88");
  expect(within(dialog).getByLabelText("Teacher Feedback (optional)")).toHaveValue("Keep this feedback");
});


test("close grades returns to its original classroom despite filter changes", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  fireEvent.click(await screen.findByRole("button", {name:"Class A"}));
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.change(screen.getByLabelText("Classroom:"), {target:{value:"B"}});
  fireEvent.click(screen.getByRole("button", {name:"Close grades"}));
  expect(screen.getByRole("heading", {name:"Class A"})).toBeInTheDocument();
  expect(screen.queryByRole("heading", {name:"Grades & Submissions"})).not.toBeInTheDocument();
});

test("close dashboard grades returns to class list even after selecting a filter", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", {name:"Class A"});
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.change(screen.getByLabelText("Classroom:"), {target:{value:"B"}});
  fireEvent.click(screen.getByRole("button", {name:"Close grades"}));
  expect(screen.getByRole("button", {name:"Class A"})).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Class B"})).toBeInTheDocument();
});

 test("open review clears completed revision even when processing and essay text are unchanged", async () => {
  const record = {id:"work",assignment_id:"essayA",classroom_id:"A",student_id:"s",transcribed_text:"Essay",grade:"80",feedback:"Old feedback",file_url:"old.txt",revision_request:{id:"revision",message:"Revise"}};
  loadTeacherSubmissionStatus.mockResolvedValue({results:[record],progress:{work:{state:"ready"}}});
  render(<TeacherDashboard profile={{id:"t",role:"teacher",full_name:"Teacher"}}/>);
  const dialog = await openSavedReview();
  expect(within(dialog).getByRole("button", {name:"Return work"})).toBeDisabled();
  await act(async () => mockProgressUpdate(rows => rows.map(row => ({...row, revisionRequest:null, revisionHistory:[{id:"revision",completed_at:"2026-10-15"}], fileUrl:"new.txt", grade:"",feedback:"",returnedAt:null}))));
  expect(within(dialog).queryByText("Revision requested: Revise")).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText("Grade / Score")).toHaveValue("");
  fireEvent.change(within(dialog).getByLabelText("Grade / Score"), {target:{value:"95"}});
  fireEvent.change(within(dialog).getByLabelText("Teacher Feedback (optional)"), {target:{value:"Latest feedback"}});
  apiFetch.mockResolvedValue({ok:true,json:async()=>({success:true,grade_record:{...record,grade:"95",feedback:"Latest feedback",status:"graded"}})});
  supabase.rpc.mockImplementation(name => Promise.resolve({data:name === "return_submission" ? {returned_at:"2026-10-15T02:00:00Z"} : []}));
  fireEvent.click(within(dialog).getByRole("button", {name:"Return work"}));
  await within(dialog).findByText(/Work returned/);
  expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("/work/grade"), expect.objectContaining({body:JSON.stringify({grade:"95",feedback:"Latest feedback",status:"graded",assignment_id:"essayA"})}));
  expect(supabase.rpc).toHaveBeenCalledWith("return_submission", {submission_key:"work"});
 });

test("return failure preserves saved inputs and enables retry without success message", async () => {
  const record = {id:"work",assignment_id:"essayA",classroom_id:"A",student_id:"s",transcribed_text:"Essay",grade:"88",feedback:"Keep feedback",status:"graded"};
  loadTeacherSubmissionStatus.mockResolvedValue({results:[record],progress:{work:{state:"ready"}}});
  render(<TeacherDashboard profile={{id:"t",role:"teacher",full_name:"Teacher"}}/>);
  const dialog = await openSavedReview();
  apiFetch.mockResolvedValue({ok:true,json:async()=>({success:true,grade_record:record})});
  supabase.rpc.mockImplementation(name => Promise.resolve(name === "return_submission" ? {error:{message:"Please retry"}} : {data:[]}));
  fireEvent.click(within(dialog).getByRole("button", {name:"Return work"}));
  await within(dialog).findByText(/Grade saved, but could not return work/);
  expect(within(dialog).getByLabelText("Grade / Score")).toHaveValue("88");
  expect(within(dialog).getByLabelText("Teacher Feedback (optional)")).toHaveValue("Keep feedback");
  expect(within(dialog).getByRole("button", {name:"Return work"})).toBeEnabled();
  expect(within(dialog).queryByText(/Work returned/)).not.toBeInTheDocument();
});

async function openScanAssignment() {
  fireEvent.click(await screen.findByRole("button", {name:"Class A"}));
  fireEvent.click(screen.getByText("Classwork tab"));
  fireEvent.click(screen.getAllByText("Essay A")[0]);
  await screen.findAllByText("No comments yet.");
}
function expectUnlinkedStation() {
  expect(screen.getByRole("combobox", {name:"Link assignment"})).toHaveValue("all");
  expect(screen.queryByText("Linked Assignment")).not.toBeInTheDocument();
  expect(screen.queryByText("Student Submissions & Roster")).not.toBeInTheDocument();
}
test("assignment directly opens a linked Scan Station, and manual unlink exposes the selector", async () => {
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.getByText("Linked Assignment")).toBeInTheDocument();
  expect(screen.getByRole("heading", {name:"Essay A"})).toBeInTheDocument();
  expect(screen.getByText("Student Submissions & Roster")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Unlink"}));
  expectUnlinkedStation();
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
  fireEvent.change(screen.getByLabelText("Link assignment"), {target:{value:"essayB"}});
  expect(screen.getByRole("heading", {name:"Essay B"})).toBeInTheDocument();
});
test.each([false,true])("return to classroom clears assignment and scan link (previously linked=%s)", async linked => {
  const view = render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  if (linked) fireEvent.click(screen.getByText("Scan tab"));
  fireEvent.click(screen.getByText("Classes tab"));
  expect(screen.getByRole("heading", {name:"Class A"})).toBeInTheDocument();
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
  fireEvent.click(screen.getByText("Classwork tab"));
  expect(screen.getByRole("heading", {name:"Classwork"})).toBeInTheDocument();
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
  view.unmount();
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await screen.findByRole("option", {name:"Essay A / Class A"});
  expectUnlinkedStation();
});
test("Back to Classwork retains classroom scope and clears assignment linking", async () => {
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  fireEvent.click(screen.getByRole("button", {name:"Back to Classwork"}));
  expect(screen.getByRole("heading", {name:"Classwork"})).toBeInTheDocument();
  expect(screen.getAllByText("Essay A").length).toBeGreaterThan(0);
  expect(screen.queryByText("Essay B")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
});
test("opening another assignment after returning to classroom links only the new assignment", async () => {
  extraAssignments = [{id:"essayA2", classroom_id:"A",teacher_id:"t",title:"Second essay"}];
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Scan tab"));
  fireEvent.click(screen.getByText("Classes tab"));
  fireEvent.click(screen.getByText("Classwork tab"));
  fireEvent.click(screen.getAllByText("Second essay")[0]);
  await screen.findAllByText("No comments yet.");
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.getByRole("heading", {name:"Second essay"})).toBeInTheDocument();
  expect(screen.queryByRole("heading", {name:"Essay A"})).not.toBeInTheDocument();
});
test("closing Grades clears assignment linking without losing the origin classroom", async () => {
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Grades tab"));
  fireEvent.click(screen.getByRole("button", {name:"Close grades"}));
  expect(screen.getByRole("heading", {name:"Class A"})).toBeInTheDocument();
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
});
test("clearing assignment context preserves uploaded scan files", async () => {
  URL.createObjectURL = jest.fn(() => "blob:preserved"); URL.revokeObjectURL = jest.fn();
  const {container} = render(<TeacherDashboard profile={{id:"t",role:"teacher"}} />);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Scan tab"));
  fireEvent.click(screen.getByRole("button", {name:"Picture"}));
  fireEvent.change(container.querySelector('input[type="file"]'), {target:{files:[new File(["image"],"retained.jpg",{type:"image/jpeg"})]}});
  expect(screen.getAllByText("retained.jpg").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText("Classes tab"));
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
  expect(screen.getAllByText("retained.jpg").length).toBeGreaterThan(0);
  await act(async () => {});
});

function mockAssignmentDeletion(fail = false) {
  supabase.rpc.mockImplementation(async (name, args) => {
    if (name === "assignment_deletion_preview") return {data:{id:"essayA",classroomId:"A",title:"Essay A",classroomName:"Class A",classroomSection:"1",students:1,submissions:0,graded:0,comments:0}};
    if (name === "delete_assignment_confirmed") {
      if (fail) return {error:{message:"Database rejected deletion"}};
      deletedAssignments.add(args.assignment_key);
      return {data:{deleted:true,id:args.assignment_key,classroomId:args.classroom_key}};
    }
    return {data:[]};
  });
}
async function openDeleteConfirmation() {
  fireEvent.click(screen.getByText("More actions"));
  fireEvent.click(screen.getByRole("button",{name:"Delete assignment"}));
  const dialog = screen.getByRole("dialog",{name:"Delete assignment?"});
  await waitFor(()=>expect(within(dialog).getByRole("textbox")).toBeEnabled());
  return dialog;
}
test("assignment deletion requires confirmation and keeps sibling/classroom after refresh and remount", async()=>{
  extraAssignments=[{id:"essayA2",classroom_id:"A",teacher_id:"t",title:"Second essay"}];
  mockAssignmentDeletion();
  const view=render(<TeacherDashboard profile={{id:"t",role:"teacher"}}/>);
  await openScanAssignment();
  const dialog=await openDeleteConfirmation();
  expect(supabase.rpc.mock.calls.filter(([name])=>name==="delete_assignment_confirmed")).toHaveLength(0);
  fireEvent.doubleClick(screen.getByRole("button",{name:"Delete assignment",hidden:true}));
  expect(deletedAssignments.size).toBe(0);
  fireEvent.keyDown(dialog,{key:"Escape"});
  expect(screen.queryByRole("dialog",{name:"Delete assignment?"})).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Essay A"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Delete assignment"}));
  const again=screen.getByRole("dialog",{name:"Delete assignment?"});
  await waitFor(()=>expect(within(again).getByRole("textbox")).toBeEnabled());
  fireEvent.change(within(again).getByRole("textbox"),{target:{value:"Essay A"}});
  fireEvent.click(within(again).getByRole("checkbox"));
  fireEvent.click(within(again).getByRole("button",{name:"Permanently delete assignment"}));
  await screen.findByText("Assignment deleted successfully.");
  expect(screen.queryByRole("dialog",{name:"Delete assignment?"})).not.toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"Classwork"})).toBeInTheDocument();
  expect(screen.queryByText("Essay A")).not.toBeInTheDocument();
  expect(screen.getAllByText("Second essay").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText("Classes tab"));
  expect(screen.getByRole("heading",{name:"Class A"})).toBeInTheDocument();
  fireEvent.click(screen.getByText("Scan tab")); expectUnlinkedStation();
  expect(screen.queryByRole("option",{name:"Essay A / Class A"})).not.toBeInTheDocument();
  view.unmount(); render(<TeacherDashboard profile={{id:"t",role:"teacher"}}/>);
  await screen.findByRole("option",{name:"Second essay / Class A"});
  expectUnlinkedStation();
  expect(screen.queryByRole("option",{name:"Essay A / Class A"})).not.toBeInTheDocument();
});
test("failed deletion keeps assignment visible with no false success",async()=>{
  mockAssignmentDeletion(true);
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}}/>);
  await openScanAssignment();
  const dialog=await openDeleteConfirmation();
  fireEvent.change(within(dialog).getByRole("textbox"),{target:{value:"Essay A"}});
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button",{name:"Permanently delete assignment"}));
  await within(dialog).findByRole("alert");
  expect(screen.queryByText("Assignment deleted successfully.")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button",{name:"Cancel"}));
  expect(screen.getByRole("heading",{name:"Essay A"})).toBeInTheDocument();
  expect(deletedAssignments.size).toBe(0);
});
test("deletion actions are absent from Scan Station and Grades",async()=>{
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}}/>);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.queryByText("Delete assignment")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Grades tab"));
  expect(screen.queryByText("Delete assignment")).not.toBeInTheDocument();
  await screen.findAllByText("No comments yet.");
});

test("deleting a still-linked assignment clears Scan Station after a notification returns to detail",async()=>{
  mockAssignmentDeletion();
  const savedWork={id:"workA",assignment_id:"essayA",classroom_id:"A",student_id:"s",essay_title:"Saved A",transcribed_text:"Saved essay",status:"submitted"};
  loadTeacherSubmissionStatus.mockResolvedValue({results:[savedWork],progress:{workA:{state:"ready"}}});
  notificationRows=[{id:"noticeA",recipient_user_id:"t",type:"submission_created",title:"Review assignment A",message:"New work",classroom_id:"A",assignment_id:"essayA",submission_id:"workA",metadata:{},is_read:false,created_at:"2026-10-14"}];
  render(<TeacherDashboard profile={{id:"t",role:"teacher"}}/>);
  await openScanAssignment();
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.getByText("Linked Assignment")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Notifications, 1 unread"}));
  fireEvent.click(await screen.findByRole("button",{name:/Review assignment A New work/}));
  fireEvent.click(await screen.findByRole("button",{name:"Close submitted work"}));
  const dialog=await openDeleteConfirmation();
  fireEvent.change(within(dialog).getByRole("textbox"),{target:{value:"Essay A"}});
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button",{name:"Permanently delete assignment"}));
  await screen.findByText("Assignment deleted successfully.");
  fireEvent.click(screen.getByText("Scan tab"));
  expectUnlinkedStation();
});

test.each(["class", "private"])("student %s notification opens assignment comments without a submission", async kind => {
  notificationRows = [{ id: "commentNotice", type: `student_${kind}_comment`, title: `New ${kind} comment`, message: "Alex commented on Essay B",
    classroom_id: "B", assignment_id: "essayB", submission_id: null, metadata: { student_id: "s" }, is_read: false, created_at: "2026-10-14" }];
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "get_classroom_roster" ? [{ student_id: "s", student_name: "Alex" }] : [] }));
  render(<TeacherDashboard profile={{ id: "t", role: "teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`New ${kind} comment`) }));
  await waitFor(() => expect(screen.getByRole("region", { name: kind === "class" ? "Class Comments" : "Private Comments" })).toHaveFocus());
  expect(screen.getByRole("heading", { name: "Essay B" })).toBeInTheDocument();
  if (kind === "private") await waitFor(() => expect(screen.getByLabelText("Student conversation")).toHaveValue("s"));
  expect(screen.queryByPlaceholderText("Leave remarks or suggestions for the student...")).not.toBeInTheDocument();
  expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_read", { notification_key: "commentNotice" });
});

test("File mode rejects unsupported input, recovers with PDF, and retains valid file on bad replacement", async () => {
  URL.createObjectURL = jest.fn(() => "blob:document"); URL.revokeObjectURL = jest.fn();
  const { container } = render(<TeacherDashboard profile={{ id: "t", role: "teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Scan tab"));
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  const choose = file => fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  choose(new File(["text"], "essay.txt", { type: "text/plain" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type. Please upload a PDF, DOC, or DOCX file only.");
  expect(container.querySelector('input[type="file"]').value).toBe("");
  choose(new File(["%PDF-1.7"], "valid.pdf", { type: "application/pdf" }));
  await screen.findAllByText("valid.pdf");
  choose(new File(["image"], "photo.jpg", { type: "image/jpeg" }));
  await screen.findByRole("alert");
  expect(screen.getAllByText("valid.pdf").length).toBeGreaterThan(0);
  expect(screen.queryByText("photo.jpg")).not.toBeInTheDocument();
  expect(checkPlagiarismViaBackend).not.toHaveBeenCalled();
});
