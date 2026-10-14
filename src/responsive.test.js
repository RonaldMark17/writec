import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Contact from "./pages/Contact";
import SubmissionReview from "./pages/dashboard/SubmissionReview";
import EssayPagePicker from "./pages/dashboard/EssayPagePicker";
import { supabase } from "./supabaseClient";
import { apiFetch, adminRequest } from "./apiFetch";
import { loadTeacherSubmissionStatus } from "./pages/dashboard/submissionProgress";
import fixture from "./pages/dashboard/__fixtures__/copyleaks-75-2.json";

jest.mock("./supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn(), auth: { updateUser: jest.fn() } }, signOutAndExpireToken: jest.fn() }));
jest.mock("./apiFetch", () => ({ ...jest.requireActual("./apiFetch"), apiFetch: jest.fn(), adminRequest: jest.fn() }));
jest.mock("./pages/dashboard/submissionProgress", () => ({ ...jest.requireActual("./pages/dashboard/submissionProgress"), useSubmissionProgress: () => "", loadTeacherSubmissionStatus: jest.fn() }));
jest.mock("./pages/dashboard/ocrService", () => ({ getOcrEngineInfo: async () => null }));

// Optional fixture export uses the real rendered components, with only services mocked.
// Run WC_CAPTURE_DIR=<directory> npm test -- --watchAll=false --runInBand responsive.test.js
function capture(name) {
  if (!process.env.WC_CAPTURE_DIR) return;
  const fs = require("fs"), path = require("path");
  fs.mkdirSync(process.env.WC_CAPTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR, `${name}.body.html`), document.body.innerHTML);
}
const teacher = { id: "t", role: "teacher", full_name: "Maria Santos", email: "maria.santos.long.email@school.example.com" };
const student = { id: "s", role: "student", full_name: "Juan Dela Cruz", email: "juan@school.example.com" };
const saved = { id: "work", assignment_id: "essayA", classroom_id: "A", student_id: "s", essay_title: "Academic integrity essay", created_at: "2026-10-14", grade: "85", returned_at: "2026-10-14", feedback: "Good evidence", transcribed_text: fixture.text, status: "graded" };
const show = (element, route = "/") => render(<MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>);
const go = (role, name) => fireEvent.click(within(screen.getByRole("navigation", { name: `${role} workspace navigation` })).getByRole("button", { name }));
beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  window.scrollTo = jest.fn();
  const channel = { on: () => channel, subscribe: () => channel };
  supabase.channel.mockReturnValue(channel);
  const notice = { id: "n", type: "grade_posted", title: "Grade posted", message: "Your essay has been reviewed. Read the teacher feedback.", classroom_id: "A", assignment_id: "essayA", submission_id: "work", metadata: { classroom_name: "Class A" }, is_read: false, created_at: "2026-10-14" };
  supabase.from.mockImplementation(table => {
    const data = table === "classroomTable" ? ["A", "B"].map(id => ({ id, teacher_id: "t", teacher_name: "Maria Santos", classroom_name: id === "A" ? "Class A" : "Class B - Advanced composition and critical thinking across academic disciplines", classroom_code: `ENG10${id}`, section: "Grade 10", subject: "English" }))
      : table === "classroomMembers" ? [{ classroom_id: "A", student_id: "s" }]
      : table === "assignmentTable" ? [{ id: "essayA", classroom_id: "A", teacher_id: "t", title: "Academic integrity essay", due_date: new Date().toISOString() }]
      : table === "notifications" ? [notice] : [];
    const query = { then: resolve => Promise.resolve({ data, count: data.length }).then(resolve) };
    ["select", "eq", "in", "order", "range", "update", "limit"].forEach(method => { query[method] = () => query; });
    return query;
  });
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "list_submission_results" ? [saved] : [] }));
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ state: "ready", score: 75.2, sources: [], peers: [], passages: [] }) });
  loadTeacherSubmissionStatus.mockResolvedValue({ results: [saved], progress: { work: { state: "ready" } } });
});

test("student destinations retain navigation and submission access", async () => {
  show(<StudentDashboard profile={student} />);
  await screen.findByRole("button", { name: "Class A" }); capture("student-classes");
  fireEvent.click(screen.getByRole("button", { name: "Menu Classes" })); capture("student-menu");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Student workspace mobile navigation" })).getByRole("button", { name: "Submissions" }));
  await screen.findAllByText("Academic integrity essay", { selector: "p" }); capture("student-submissions");
  expect(document.querySelector('.wc-data-row [data-label="Grade"]')).toHaveTextContent("85");
  go("Student", "Calendar"); capture("student-calendar");
  go("Student", "To-do"); capture("student-todo");
  go("Student", "Classes");
  fireEvent.click(screen.getByRole("button", { name: "Class A" })); capture("student-classroom");
  fireEvent.click(screen.getByRole("button", { name: /Academic integrity essay/ })); capture("student-assignment");
  fireEvent.click(screen.getByRole("button", { name: /Notifications, / }));
  await screen.findByRole("button", { name: /Grade posted Your essay/ }); capture("notification-sheet");
  fireEvent.click(screen.getByRole("button", { name: /View all/i })); capture("notifications");
  fireEvent.click(screen.getByRole("button", { name: "Open profile" })); capture("profile");
});

test("teacher destinations retain class creation, scan and grading access", async () => {
  show(<TeacherDashboard profile={teacher} />);
  await screen.findByRole("button", { name: "Class A" }); capture("teacher-classes");
  fireEvent.click(screen.getByRole("button", { name: "Create class" })); capture("create-class");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Class A" })); capture("teacher-classroom");
  fireEvent.click(screen.getByRole("button", { name: "Create assignment" })); capture("create-assignment");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Members" }));
  await act(async () => {}); capture("teacher-roster");
  go("Teacher", "Scan Station"); capture("scan-station");
  go("Teacher", "Grades");
  await screen.findByRole("option", { name: /Academic integrity essay/ });
  fireEvent.change(screen.getByLabelText("Assignment:"), { target: { value: "essayA" } }); capture("teacher-grades");
  fireEvent.click(await screen.findByRole("button", { name: /^Review(?: & Grade)?$/ }));
  await screen.findByText("Not checked"); capture("teacher-grading");
  fireEvent.change(screen.getByLabelText("Teacher Feedback (optional)"), { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "View sources" })); capture("teacher-sources");
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Sources and peer matches" }), { key: "Escape" });
  expect(screen.getByLabelText("Teacher Feedback (optional)")).toHaveValue("Keep this draft");
});

test("admin card labels preserve approval selection and bulk actions", async () => {
  adminRequest.mockResolvedValue({ items: [{ id: "s", full_name: "Juan Dela Cruz", email: "very.long.student.email.address@school.example.com", role: "student", account_status: "pending", registered_at: "2026-10-14" }], total: 1 });
  show(<AdminDashboard profile={{ ...teacher, role: "admin" }} />, "/admin/approvals");
  await screen.findByText("Juan Dela Cruz"); capture("admin-approvals");
  expect(document.querySelector('[data-label="Email"]')).toHaveTextContent("school.example.com");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all pending users on this page" })); capture("admin-bulk");
  fireEvent.click(screen.getByRole("button", { name: "Approve Selected" })); capture("admin-confirmation");
  expect(screen.getByRole("dialog")).toHaveTextContent("Approve 1 selected accounts?");
});

test("review highlights, source dialogs, uploads and contact remain available", async () => {
  const props = { submission: { id: "work", studentName: student.full_name, assignmentTitle: "Academic integrity essay", classroomName: "Class A", processingState: "ready", createdAt: "2026-10-14" }, profile: teacher, text: fixture.text, result: fixture.report, onClose: jest.fn(), onCopy: jest.fn(), grading: <div>Grading</div> };
  const view = render(<SubmissionReview {...props} />); capture("highlighted-review");
  fireEvent.click(screen.getByRole("button", { name: "View sources" })); capture("source-dialog");
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Sources and peer matches" }), { key: "Escape" });
  fireEvent.click(document.querySelector("mark")); capture("passage-dialog");
  expect(screen.getByRole("link", { name: "View Source" })).toHaveAttribute("href", fixture.source.url);
  view.unmount();
  URL.createObjectURL = jest.fn(() => "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='140'%3E%3Crect width='100' height='140' fill='%23ddd'/%3E%3C/svg%3E"); URL.revokeObjectURL = jest.fn();
  const uploads = render(<main><EssayPagePicker files={[new File(["page"], "long-essay-page-one.png", { type: "image/png" }), new File(["page"], "page-two.png", { type: "image/png" })]} onChange={jest.fn()} /></main>);
  await act(async () => {}); capture("uploads"); uploads.unmount();
  show(<Contact />); capture("contact");
});
