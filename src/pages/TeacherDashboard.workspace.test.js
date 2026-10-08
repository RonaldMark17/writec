import { checkPeerSimilarityViaBackend } from "./dashboard/plagiarismScan";
jest.mock("./dashboard/plagiarismScan", () => ({ ...jest.requireActual("./dashboard/plagiarismScan"), checkPeerSimilarityViaBackend: jest.fn() }));
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { loadTeacherSubmissionStatus } from "./dashboard/submissionProgress";
import TeacherDashboard from "./TeacherDashboard";
import { supabase } from "../supabaseClient";
import { downloadGrades } from "./dashboard/gradeExport";
jest.mock("./dashboard/gradeExport", () => ({ ...jest.requireActual("./dashboard/gradeExport"), downloadGrades: jest.fn(async () => {}) }));
jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock("./dashboard/ocrService", () => ({ getOcrEngineInfo: async () => null }));
jest.mock("./dashboard/submissionProgress", () => ({ ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: () => "",
  loadTeacherSubmissionStatus: jest.fn(async () => ({ results: [], progress: {} })) }));
jest.mock("./dashboard/shared", () => ({ ...jest.requireActual("./dashboard/shared"), Header: ({ onPageChange }) => <>
  <button onClick={() => onPageChange("classrooms")}>Classes tab</button><button onClick={() => onPageChange("assignments")}>Classwork tab</button><button onClick={() => onPageChange("submissions")}>Grades tab</button></> }));
let archived = false;
let extraAssignments = [];
let onArchiveUpdate;
beforeEach(() => {
  downloadGrades.mockClear();
  checkPeerSimilarityViaBackend.mockResolvedValue({ total_peers_compared: 0, all_matches: [] });
  archived = false;
  extraAssignments = [];
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [], progress: {} });
  supabase.channel.mockImplementation(() => { const channel = { on: (type, filter, callback) => { onArchiveUpdate = callback; return channel; }, subscribe: () => channel }; return channel; });
  sessionStorage.clear(); window.history.replaceState({}, "", "/");
  supabase.rpc.mockResolvedValue({ data: [] });
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomTable" ? ["A", "B"].map(id => ({ id, teacher_id: "t", teacher_name: "Teacher", classroom_name: `Class ${id}`, classroom_code: id, is_archived: archived && id === "B" }))
      : table === "assignmentTable" ? ["A", "B"].map(id => ({ id: `essay${id}`, classroom_id: id, teacher_id: "t", title: `Essay ${id}` })).concat(extraAssignments) : [];
    const query = { then: resolve => Promise.resolve({ data }).then(resolve) };
    ["select", "eq", "in", "order", "update"].forEach(name => { query[name] = () => query; });
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
