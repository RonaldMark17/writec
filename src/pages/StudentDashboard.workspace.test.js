import { act, configure, fireEvent, render, screen, within } from "@testing-library/react";
import StudentDashboard from "./StudentDashboard";
import { useSubmissionProgress } from "./dashboard/submissionProgress";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock("./dashboard/submissionProgress", () => ({ ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: jest.fn(() => "") }));
jest.mock("./dashboard/SubmissionFilePreview", () => ({ fileUrl }) => <div>Saved file: {fileUrl}</div>);
jest.mock("./dashboard/shared", () => ({ ...jest.requireActual("./dashboard/shared"), Header: ({ onPageChange }) => <>
  <button onClick={() => onPageChange("classrooms")}>Classes tab</button><button onClick={() => onPageChange("assignments")}>Assignments tab</button></> }));
configure({ asyncUtilTimeout: 10000 });
const profile = { id: "s", role: "student", full_name: "Alex" };
const saved = { id: "work", assignment_id: "a", classroom_id: "A", student_id: "s", essay_title: "My saved essay",
  file_url: "s/a/original.pdf", created_at: "2026-01-02T10:00:00Z", returned_at: "2026-01-03T10:00:00Z", grade: "90", feedback: "Well done", transcribed_text: "My original essay", status: "graded" };
function setup({ archived = false, results = [saved] } = {}) {
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomMembers" ? [{ classroom_id: "A", student_id: "s" }]
      : table === "classroomTable" ? [{ id: "A", classroom_name: "English", classroom_code: "ENG", is_archived: archived }]
      : table === "assignmentTable" ? [{ id: "a", classroom_id: "A", title: "Essay A", due_date: "2025-01-01" }] : [];
    const query = { then: resolve => Promise.resolve({ data }).then(resolve) };
    ["select", "eq", "in", "order"].forEach(name => { query[name] = () => query; });
    return query;
  });
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "list_submission_results" ? results : [] }));
}
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

test("submitted assignment opens saved work and remains available after a fresh mount", async () => {
  setup({ results: [saved, { ...saved, id: "foreign", student_id: "other", essay_title: "Someone else's essay" }] });
  let view = render(<StudentDashboard profile={profile} />);
  for (let attempt = 0; attempt < 2; attempt++) {
    fireEvent.click(screen.getByText("Assignments tab"));
    fireEvent.click(await screen.findByRole("button", { name: /Essay A.*Turned In/ }));
    await screen.findAllByText("No comments yet.");
    const work = screen.getByRole("region", { name: "Submitted work" });
    expect(within(work).getByText("Turned In")).toBeInTheDocument();
    expect(within(work).getByText("My saved essay")).toBeInTheDocument();
    expect(within(work).getByText("Grade: 90")).toBeInTheDocument();
    expect(within(work).getByText("Teacher feedback: Well done")).toBeInTheDocument();
    expect(within(work).getByText(/Saved file: s\/a\/original.pdf/)).toBeInTheDocument();
    expect(within(work).getByText(/^Submitted /)).toBeInTheDocument();
    expect(screen.queryByText("No work due")).not.toBeInTheDocument();
    expect(screen.queryByText("Someone else's essay")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit assignment" })).not.toBeInTheDocument();
    if (!attempt) { view.unmount(); view = render(<StudentDashboard profile={profile} />); }
  }
});

test("submission loading never renders a false empty state", async () => {
  setup();
  let resolve;
  supabase.rpc.mockImplementation(name => name === "list_submission_results" ? new Promise(done => { resolve = done; }) : Promise.resolve({ data: [] }));
  render(<StudentDashboard profile={profile} />);
  fireEvent.click(screen.getByText("Assignments tab"));
  expect(screen.getByText("Loading submission...")).toBeInTheDocument();
  expect(screen.queryByText("No work due")).not.toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  await act(async () => resolve({ data: [saved] }));
  expect(await screen.findByRole("button", { name: /Essay A.*Turned In/ })).toBeInTheDocument();
});

test("archive menu follows records and disappears when the last class is restored", async () => {
  setup({ archived: true });
  render(<StudentDashboard profile={profile} />);
  expect(await screen.findByRole("button", { name: /Archived classes/ })).toBeInTheDocument();
  act(() => window.dispatchEvent(new CustomEvent("writecheck:classroom_archived", { detail: { classroomId: "A", isArchived: false } })));
  expect(screen.queryByRole("button", { name: /Archived classes/ })).not.toBeInTheDocument();
  act(() => window.dispatchEvent(new CustomEvent("writecheck:classroom_archived", { detail: { classroomId: "A", isArchived: true } })));
  expect(screen.getByRole("button", { name: /Archived classes/ })).toBeInTheDocument();
});

test("zero archived records ignores a stale global archive cache", async () => {
  localStorage.setItem("writecheck_archived_classes_global", JSON.stringify(["A"]));
  setup();
  render(<StudentDashboard profile={profile} />);
  await screen.findByRole("button", { name: /Open classroom/ });
  expect(screen.queryByRole("button", { name: /Archived classes/ })).not.toBeInTheDocument();
  localStorage.clear();
});


test("newly saved submission changes an overdue assignment to Turned In", async () => {
  setup({ results: [] });
  let updateSubmissions;
  useSubmissionProgress.mockImplementation((id, setter) => { updateSubmissions = setter; return ""; });
  render(<StudentDashboard profile={profile} />);
  fireEvent.click(screen.getByText("Assignments tab"));
  expect(await screen.findByRole("button", { name: "Add or create" })).toBeInTheDocument();
  expect(screen.getByText("Overdue")).toBeInTheDocument();
  act(() => updateSubmissions([{ id: "work", studentId: "s", assignmentId: "a", classroomId: "A", fileUrl: "s/a/original.pdf", createdAt: "2026-01-02", status: "submitted" }]));
  expect(screen.getByRole("button", { name: /Essay A.*Turned In/ })).toBeInTheDocument();
  expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
});
