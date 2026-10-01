import { act, fireEvent, render, screen, within } from "@testing-library/react";
import TeacherDashboard from "./TeacherDashboard";
import { supabase } from "../supabaseClient";
jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock("./dashboard/ocrService", () => ({ getOcrEngineInfo: async () => null }));
jest.mock("./dashboard/submissionProgress", () => ({ ...jest.requireActual("./dashboard/submissionProgress"), useSubmissionProgress: () => "",
  loadTeacherSubmissionStatus: async () => ({ results: [], progress: {} }) }));
jest.mock("./dashboard/shared", () => ({ ...jest.requireActual("./dashboard/shared"), Header: ({ onPageChange }) => <>
  <button onClick={() => onPageChange("classrooms")}>Classes tab</button><button onClick={() => onPageChange("assignments")}>Classwork tab</button><button onClick={() => onPageChange("submissions")}>Grades tab</button></> }));
let archived = false;
let onArchiveUpdate;
beforeEach(() => {
  archived = false;
  supabase.channel.mockImplementation(() => { const channel = { on: (type, filter, callback) => { onArchiveUpdate = callback; return channel; }, subscribe: () => channel }; return channel; });
  sessionStorage.clear(); window.history.replaceState({}, "", "/");
  supabase.rpc.mockResolvedValue({ data: [] });
  supabase.from.mockImplementation((table) => {
    const data = table === "classroomTable" ? ["A", "B"].map(id => ({ id, teacher_id: "t", teacher_name: "Teacher", classroom_name: `Class ${id}`, classroom_code: id, is_archived: archived && id === "B" }))
      : table === "assignmentTable" ? ["A", "B"].map(id => ({ id: `essay${id}`, classroom_id: id, teacher_id: "t", title: `Essay ${id}` })) : [];
    const query = { then: resolve => Promise.resolve({ data }).then(resolve) };
    ["select", "eq", "in", "order", "update"].forEach(name => { query[name] = () => query; });
    return query;
  });
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
  expect(screen.getByLabelText("Class:")).toHaveValue("B");
  fireEvent.change(screen.getByLabelText("Class:"), { target: { value: "A" } });
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
