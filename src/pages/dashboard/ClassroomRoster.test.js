import { fireEvent, render, screen } from "@testing-library/react";
import ClassroomRoster from "./ClassroomRoster";
import { supabase } from "../../supabaseClient";

jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

test("loads the selected classroom roster when expanded", async () => {
  supabase.rpc.mockResolvedValue({ data: [{ student_id: "s1", student_name: "Alex Santos" }] });
  render(<ClassroomRoster classroomId="class-1" />);
  expect(supabase.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View students" }));
  expect(await screen.findByText("Alex Santos")).toBeInTheDocument();
  expect(supabase.rpc).toHaveBeenCalledWith("get_classroom_roster", { requested_classroom_id: "class-1" });
  expect(screen.getByText("Students (1)")).toBeInTheDocument();
});

test("shows errors instead of an empty roster and supports retry", async () => {
  supabase.rpc.mockResolvedValueOnce({ error: { message: "Access denied" } })
    .mockResolvedValueOnce({ data: [] });
  render(<ClassroomRoster classroomId="class-2" />);
  fireEvent.click(screen.getByRole("button", { name: "View students" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load students");
  expect(screen.queryByText("No students enrolled yet.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No students enrolled yet.")).toBeInTheDocument();
});

test("does not retain students when the classroom changes", async () => {
  supabase.rpc.mockResolvedValueOnce({ data: [{ student_id: "s1", student_name: "Alex Santos" }] })
    .mockResolvedValueOnce({ data: [{ student_id: "s2", student_name: "Sam Reyes" }] });
  const { rerender } = render(<ClassroomRoster classroomId="class-1" />);
  fireEvent.click(screen.getByRole("button", { name: "View students" }));
  await screen.findByText("Alex Santos");
  rerender(<ClassroomRoster classroomId="class-2" />);
  expect(await screen.findByText("Sam Reyes")).toBeInTheDocument();
  expect(screen.queryByText("Alex Santos")).not.toBeInTheDocument();
});
