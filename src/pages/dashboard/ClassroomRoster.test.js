import { fireEvent, render, screen } from "@testing-library/react";
import ClassroomRoster from "./ClassroomRoster";
import { supabase } from "../../supabaseClient";

jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: [] }),
    in: jest.fn().mockResolvedValue({ data: [] }),
  });
});

test("loads the selected classroom roster and displays teacher details", async () => {
  supabase.rpc.mockResolvedValue({ data: [{ student_id: "s1", student_name: "Alex Santos" }] });
  render(<ClassroomRoster classroomId="class-1" teacher={{ id: "t1", name: "Professor X", email: "teacher2@gmail.com" }} />);
  expect(await screen.findByText("Alex Santos")).toBeInTheDocument();
  expect(screen.getByText("Professor X")).toBeInTheDocument();
  expect(screen.getByText("teacher2@gmail.com")).toBeInTheDocument();
  expect(supabase.rpc).toHaveBeenCalledWith("get_classroom_roster", { requested_classroom_id: "class-1" });
});

test("shows errors instead of an empty roster and supports retry", async () => {
  supabase.rpc.mockImplementationOnce(() => {
    throw new Error("Access denied");
  });
  supabase.from.mockImplementationOnce(() => {
    throw new Error("Access denied");
  });
  render(<ClassroomRoster classroomId="class-2" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load class members");
  expect(screen.queryByText("No students enrolled yet")).not.toBeInTheDocument();

  supabase.rpc.mockResolvedValueOnce({ data: [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No students enrolled yet")).toBeInTheDocument();
});

test("does not retain students when the classroom changes", async () => {
  supabase.rpc
    .mockResolvedValueOnce({ data: [{ student_id: "s1", student_name: "Alex Santos" }] })
    .mockResolvedValueOnce({ data: [{ student_id: "s2", student_name: "Sam Reyes" }] });
  const { rerender } = render(<ClassroomRoster classroomId="class-1" />);
  await screen.findByText("Alex Santos");
  rerender(<ClassroomRoster classroomId="class-2" />);
  expect(await screen.findByText("Sam Reyes")).toBeInTheDocument();
  expect(screen.queryByText("Alex Santos")).not.toBeInTheDocument();
});

test("confirms removal and refreshes only the selected classroom", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  const onMemberRemoved = jest.fn();
  supabase.rpc.mockImplementation((name) => Promise.resolve({ data: name === "get_classroom_roster"
    ? [{ student_id: "s1", student_name: "Alex Santos" }] : true }));
  render(<ClassroomRoster classroomId="class-1" canRemove onMemberRemoved={onMemberRemoved} />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove Student" }));
  expect(confirm).toHaveBeenCalledWith("Are you sure you want to remove Alex Santos from this classroom?");
  await screen.findByRole("button", { name: "Remove Student" });
  expect(supabase.rpc).toHaveBeenCalledWith("remove_classroom_student", {
    requested_classroom_id: "class-1", requested_student_id: "s1",
  });
  expect(onMemberRemoved).toHaveBeenCalledWith("class-1", "s1");
  expect(supabase.rpc.mock.calls.filter(([name]) => name === "get_classroom_roster")).toHaveLength(2);
  confirm.mockRestore();
});

test("cancelling removal leaves the member alone", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  supabase.rpc.mockResolvedValue({ data: [{ student_id: "s1", student_name: "Alex Santos" }] });
  render(<ClassroomRoster classroomId="class-1" canRemove />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove Student" }));
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Alex Santos")).toBeInTheDocument();
  confirm.mockRestore();
});

test("student roster has no removal action", async () => {
  supabase.rpc.mockResolvedValue({ data: [{ student_id: "s1", student_name: "Alex Santos" }] });
  render(<ClassroomRoster classroomId="class-1" />);
  await screen.findByText("Alex Santos");
  expect(screen.queryByRole("button", { name: "Remove Student" })).not.toBeInTheDocument();
});
