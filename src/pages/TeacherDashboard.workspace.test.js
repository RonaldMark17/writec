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
jest.mock("./dashboard/submissionProgress", () => ({ ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: () => "",
  loadTeacherSubmissionStatus: jest.fn(async () => ({ results: [], progress: {} })) }));
jest.mock("./dashboard/shared", () => ({ ...jest.requireActual("./dashboard/shared"), Header: ({ onPageChange }) => <>
  <button onClick={() => onPageChange("upload")}>Scan tab</button><button onClick={() => onPageChange("classrooms")}>Classes tab</button><button onClick={() => onPageChange("assignments")}>Classwork tab</button><button onClick={() => onPageChange("submissions")}>Grades tab</button></> }));
let archived = false;
let extraAssignments = [];
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
  apiFetch.mockReset().mockResolvedValue({ok:true,json:async()=>({})});
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

test("Scan Station has no filters and retains upload and clear actions", async () => {
  render(<TeacherDashboard profile={{ id: "t", role: "teacher", full_name: "Teacher" }} />);
  await screen.findByRole("button", { name: "Class A" });
  fireEvent.click(screen.getByText("Scan tab"));
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
  await screen.findByText(/Peer similarity has not been checked/);
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
