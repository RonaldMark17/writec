import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "./StudentDashboard";
import { supabase } from "../supabaseClient";
import { apiFetch } from "../apiFetch";
import { extractTextFromImage } from "./dashboard/ocrService";

jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock("../apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("./dashboard/ocrService", () => ({ extractTextFromImage: jest.fn() }));
jest.mock("./dashboard/submissionProgress", () => ({
  ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: () => "",
}));
jest.mock("./dashboard/shared", () => ({
  ...jest.requireActual("./dashboard/shared"),
  Header: ({ onPageChange }) => <button onClick={() => onPageChange("assignments")}>Assignments tab</button>,
}));

const student = "00000000-0000-0000-0000-000000000003";
const assignment = "00000000-0000-0000-0000-000000000005";

test("student reviews streamed text before saving the original image and corrected essay", async () => {
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
