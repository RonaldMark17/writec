import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "./StudentDashboard";
import { supabase } from "../supabaseClient";
import { apiFetch } from "../apiFetch";
import { useSubmissionProgress } from "./dashboard/submissionProgress";
import { extractTextFromImage, extractTextFromImages } from "./dashboard/ocrService";

jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock("../apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("./dashboard/ocrService", () => ({ extractTextFromImage: jest.fn(), extractTextFromImages: jest.fn() }));
jest.mock("./dashboard/submissionProgress", () => ({
  ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: jest.fn(() => ""),
}));
jest.mock("./dashboard/shared", () => ({
  ...jest.requireActual("./dashboard/shared"),
  Header: ({ onPageChange }) => <><button onClick={() => onPageChange("assignments")}>Assignments tab</button><button onClick={() => onPageChange("submissions")}>Submissions tab</button></>,
}));

const student = "00000000-0000-0000-0000-000000000003";
const assignment = "00000000-0000-0000-0000-000000000005";

test("teacher-requested revision reopens a closed deadline and rejected saves preserve the draft", async () => {
  jest.clearAllMocks();
  useSubmissionProgress.mockImplementation(() => "");
  const revision = { id: "00000000-0000-0000-0000-000000000040", message: "Add evidence to your conclusion." };
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "list_submission_results" ? [{
    id: "saved", assignment_id: assignment, classroom_id: "class", student_id: student,
    essay_title: "Earlier essay", revision_request: revision, revision_history: [], status: "graded",
  }] : [], error: null }));
  supabase.from.mockImplementation(table => {
    const data = table === "classroomMembers" ? [{ classroom_id: "class", student_id: student }]
      : table === "classroomTable" ? [{ id: "class", classroom_name: "English", classroom_code: "ENG" }]
      : table === "assignmentTable" ? [{ id: assignment, classroom_id: "class", title: "Revise this essay", due_date: "2000-01-01", accept_late_submissions: false }] : [];
    const query = { then: resolve => Promise.resolve({ data, error: null }).then(resolve) };
    for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
    return query;
  });
  supabase.storage.from.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  apiFetch.mockResolvedValue({ ok: false, json: async () => ({ detail: "Revision request was already completed." }) });
  render(<StudentDashboard profile={{ id: student, role: "student", full_name: "Alex" }} />);
  fireEvent.click(screen.getByText("Assignments tab"));
  fireEvent.click(await screen.findByRole("button", { name: "Add or create" }));
  expect(screen.getByLabelText("Essay title").closest("form").compareDocumentPosition(
    screen.getByRole("region", { name: "Class Comments" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(revision.message)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Paste" }));
  fireEvent.change(screen.getByLabelText("Paste text"), { target: { value: "Revised essay with evidence." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit assignment" }));
  await screen.findAllByText("Revision request was already completed.");
  expect(screen.getByLabelText("Paste text")).toHaveValue("Revised essay with evidence.");
  expect(JSON.parse(apiFetch.mock.calls[0][1].body).revision_request_id).toBe(revision.id);
  expect(supabase.rpc).not.toHaveBeenCalledWith("accessible_submissions");
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "saved" }) });
  fireEvent.click(screen.getByRole("button", { name: "Submit assignment" }));
  await screen.findAllByText("Revision submitted. Your previous work remains in revision history.");
});

test("student reviews streamed text before saving the original image and corrected essay", async () => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:essay");
  URL.revokeObjectURL = jest.fn();
  let finishOcr;
  extractTextFromImage.mockImplementation(() => new Promise((resolve) => { finishOcr = resolve; }));
  const upload = jest.fn().mockResolvedValue({ error: null });
  supabase.storage.from.mockReturnValue({ upload });
  supabase.rpc.mockResolvedValue({ data: [], error: null });
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomMembers" ? [{ id: "member", classroom_id: "class", student_id: student }]
      : table === "classroomTable" ? [{ id: "class", classroom_name: "English", classroom_code: "ENG1" }]
      : table === "assignmentTable" ? [{ id: assignment, classroom_id: "class", title: "My assignment", accept_late_submissions: true }]
      : [];
    const query = { then: (resolve) => Promise.resolve({ data, error: null }).then(resolve) };
    for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
    return query;
  });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "saved", already_submitted: false }) });
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <StudentDashboard profile={{ id: student, full_name: "Alex", role: "student" }} />
  </MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Assignments tab" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add or create" }));
  fireEvent.click(screen.getByRole("button", { name: "Picture" }));
  const file = new File(["image"], "essay.jpg", { type: "image/jpeg" });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  expect(screen.getByRole("button", { name: "Transcribing…" })).toBeDisabled();
  await waitFor(() => expect(extractTextFromImage).toHaveBeenCalledTimes(1));
  act(() => extractTextFromImage.mock.calls[0][1].onProgress({ text: "First line", detectedLineCount: 2, processedLineCount: 1 }));
  expect(screen.getByLabelText("Essay transcription")).toHaveValue("First line");
  expect(upload).not.toHaveBeenCalled();
  expect(apiFetch).not.toHaveBeenCalled();
  await act(async () => finishOcr({ text: "Complete original transcription", detectedLineCount: 2, processedLineCount: 2 }));
  fireEvent.change(screen.getByLabelText("Essay transcription"), { target: { value: "Student reviewed essay text" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit assignment" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  expect(upload.mock.calls[0][1]).toBe(file);
  const [url, options] = apiFetch.mock.calls[0];
  expect(url).toMatch(/\/api\/submissions\/submit$/);
  expect(JSON.parse(options.body)).toEqual(expect.objectContaining({ assignment_id: assignment, text: "Student reviewed essay text" }));
  expect(upload.mock.invocationCallOrder[0]).toBeLessThan(apiFetch.mock.invocationCallOrder[0]);
  expect(extractTextFromImage).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByLabelText("Essay transcription")).not.toBeInTheDocument());
});


test("failed ungraded work can be replaced, but a rejected retry is not mistaken for the old saved submission", async () => {
  jest.clearAllMocks();
  let setRows;
  useSubmissionProgress.mockImplementation((id, setter) => { setRows = setter; return ""; });
  supabase.storage.from.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  supabase.rpc.mockResolvedValue({ data: [{ id: "failed-work", assignment_id: assignment, student_id: student,
    classroom_id: "class", essay_title: "Original essay", status: "submitted" }], error: null });
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomMembers" ? [{ id: "member", classroom_id: "class", student_id: student }]
      : table === "classroomTable" ? [{ id: "class", classroom_name: "English", classroom_code: "ENG1" }]
      : table === "assignmentTable" ? [{ id: assignment, classroom_id: "class", title: "My assignment", accept_late_submissions: true }] : [];
    const query = { then: resolve => Promise.resolve({ data, error: null }).then(resolve) };
    for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
    return query;
  });
  apiFetch.mockResolvedValue({ ok: false, json: async () => ({ detail: "Graded work cannot be resubmitted." }) });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <StudentDashboard profile={{ id: student, full_name: "Alex", role: "student" }} />
  </MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Submissions tab" }));
  await screen.findByText("Original essay");
  act(() => setRows(rows => rows.map(row => ({ ...row, processingState: "failed", processingJobId: "job-1" }))));
  fireEvent.click(screen.getByRole("button", { name: "Resubmit failed work" }));
  fireEvent.click(screen.getByRole("button", { name: "Paste" }));
  fireEvent.change(screen.getByLabelText("Paste text"), { target: { value: "Replacement reviewed essay text" } });
  fireEvent.click(screen.getByRole("button", { name: "Resubmit assignment" }));
  await screen.findAllByText("Graded work cannot be resubmitted.");
  expect(screen.getByLabelText("Paste text")).toHaveValue("Replacement reviewed essay text");
  expect(JSON.parse(apiFetch.mock.calls[0][1].body).retry_job_id).toBe("job-1");
  expect(supabase.rpc).not.toHaveBeenCalledWith("accessible_submissions");
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "failed-work", already_submitted: false }) });
  fireEvent.click(screen.getByRole("button", { name: "Resubmit assignment" }));
  await screen.findAllByText("Work resubmitted. Processing has been queued again.");
  expect(screen.queryByLabelText("Paste text")).not.toBeInTheDocument();
  act(() => setRows(rows => rows.map(row => ({ ...row, status: "graded", grade: "" }))));
  expect(screen.queryByRole("button", { name: "Resubmit failed work" })).not.toBeInTheDocument();
});

test("student reorders three pages, reviews them, and submits one complete essay", async () => {
  jest.clearAllMocks();
  useSubmissionProgress.mockImplementation(() => "");
  URL.createObjectURL = jest.fn(() => "blob:essay"); URL.revokeObjectURL = jest.fn();
  supabase.rpc.mockResolvedValue({ data: [], error: null });
  supabase.from.mockImplementation(table => {
    const data = table === "classroomMembers" ? [{ classroom_id: "class", student_id: student }]
      : table === "classroomTable" ? [{ id: "class", classroom_name: "English" }]
      : table === "assignmentTable" ? [{ id: assignment, classroom_id: "class", title: "Multi-page essay" }] : [];
    const query = { then: resolve => Promise.resolve({ data }).then(resolve) };
    ["select", "eq", "in", "order"].forEach(method => { query[method] = () => query; });
    return query;
  });
  const storageUpload = jest.fn();
  supabase.storage.from.mockReturnValue({ upload: storageUpload });
  const files = ["z", "a", "m"].map(name => new File(["image"], `${name}.jpg`, { type: "image/jpeg" }));
  extractTextFromImages.mockImplementation(async ordered => {
    const pages = ordered.map((file, i) => ({ page_number: i + 1, text: file.name, status: "ready" }));
    return { pages, text: pages.map(page => page.text).join("\n") };
  });
  apiFetch.mockImplementation(async url => ({ ok: true, json: async () => url.endsWith("upload-pages")
    ? { file_url: "http://localhost:8000/uploads/submissions/student/assignment/test.essay.zip" } : { id: "saved" } }));
  const { container } = render(<StudentDashboard profile={{ id: student, role: "student", full_name: "Alex" }} />);
  fireEvent.click(screen.getByText("Assignments tab"));
  fireEvent.click(await screen.findByRole("button", { name: "Add or create" }));
  fireEvent.click(screen.getByRole("button", { name: "Picture" }));
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } });
  expect(extractTextFromImages).not.toHaveBeenCalled();
  expect(screen.getAllByAltText(/Page \d preview/)).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Move page 3 up" }));
  expect(screen.getByRole("button", { name: "Submit assignment" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Transcribe pages" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit assignment" })).toBeEnabled());
  expect(extractTextFromImages.mock.calls[0][0]).toEqual([files[0], files[2], files[1]]);
  fireEvent.change(screen.getByLabelText("Page 2 transcription"), { target: { value: "Corrected continuation" } });
  expect(screen.getByLabelText("Essay transcription")).toHaveValue("z.jpg\nCorrected continuation\na.jpg");
  fireEvent.click(screen.getByRole("button", { name: "Submit assignment" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  expect(apiFetch.mock.calls[0][1].body.getAll("files")).toEqual([files[0], files[2], files[1]]);
  const metadata = JSON.parse(apiFetch.mock.calls[0][1].body.get("pages"));
  expect(metadata.map(page => page.page_number)).toEqual([1, 2, 3]);
  expect(JSON.parse(apiFetch.mock.calls[1][1].body).text).toBe("z.jpg\nCorrected continuation\na.jpg");
  expect(storageUpload).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByLabelText("Essay transcription")).not.toBeInTheDocument());
});

test("document selection rejects unsupported files before extraction and permits valid replacement", async () => {
  jest.clearAllMocks(); useSubmissionProgress.mockImplementation(() => "");
  URL.createObjectURL = jest.fn(() => "blob:document"); URL.revokeObjectURL = jest.fn();
  const upload = jest.fn(); supabase.storage.from.mockReturnValue({ upload });
  supabase.rpc.mockResolvedValue({ data: [], error: null });
  supabase.from.mockImplementation(table => {
    const data = table === "classroomMembers" ? [{ classroom_id: "class", student_id: student }]
      : table === "classroomTable" ? [{ id: "class", classroom_name: "English", classroom_code: "ENG" }]
      : table === "assignmentTable" ? [{ id: assignment, classroom_id: "class", title: "Document essay" }] : [];
    const query = { then: resolve => Promise.resolve({ data, error: null }).then(resolve) };
    for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
    return query;
  });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ text: "Extracted PDF essay" }) });
  const { container } = render(<StudentDashboard profile={{ id: student, role: "student" }} />);
  fireEvent.click(screen.getByText("Assignments tab"));
  fireEvent.click(await screen.findByRole("button", { name: "Add or create" }));
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  const choose = file => fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  choose(new File(["text"], "bad.txt", { type: "text/plain" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type. Please upload a PDF, DOC, or DOCX file only.");
  expect(apiFetch).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(extractTextFromImage).not.toHaveBeenCalled();
  choose(new File(["%PDF-1.7"], "essay.pdf", { type: "application/pdf" }));
  await waitFor(() => expect(screen.getByLabelText("Essay transcription")).toHaveValue("Extracted PDF essay"));
  choose(new File(["image"], "bad.jpg", { type: "image/jpeg" }));
  await screen.findByRole("alert");
  expect(screen.getAllByText("essay.pdf").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Essay transcription")).toHaveValue("Extracted PDF essay");
  expect(apiFetch).toHaveBeenCalledTimes(1); expect(upload).not.toHaveBeenCalled();
});
