import { act, fireEvent, render, screen, within } from "@testing-library/react";
import ClassroomRoster from "./ClassroomRoster";
import { supabase } from "../../supabaseClient";

jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn(), from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));
let membershipChanged;

beforeEach(() => {
  jest.clearAllMocks();
  supabase.channel.mockImplementation(() => {
    const channel = { on: (event, filter, callback) => { membershipChanged = callback; return channel; }, subscribe: () => channel };
    return channel;
  });
  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: [] }),
    in: jest.fn().mockResolvedValue({ data: [] }),
  });
});

test("surname order survives removal and a new membership reload", async () => {
  let roster = [{ student_id: "s", student_name: "Maria Santos" },
    { student_id: "c", student_name: "Juan Dela Cruz" }, { student_id: "g", student_name: "Ana Garcia" }];
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  supabase.rpc.mockImplementation((name, args) => {
    if (name === "remove_classroom_student") roster = roster.filter(row => row.student_id !== args.requested_student_id);
    return Promise.resolve({ data: name === "get_classroom_roster" ? roster : true });
  });
  render(<ClassroomRoster classroomId="A" canRemove teacher={{ name: "Teacher Z" }} />);
  await screen.findByText("Juan Dela Cruz");
  const displayedNames = () => within(screen.getByRole("list", { name: "Student list" }))
    .getAllByRole("listitem").map(item => item.querySelector("p").textContent);
  expect(displayedNames()).toEqual(["Juan Dela Cruz", "Ana Garcia", "Maria Santos"]);
  fireEvent.click(within(screen.getByText("Juan Dela Cruz").closest("li")).getByRole("button", { name: "Remove Student" }));
  await screen.findByText("Ana Garcia");
  expect(displayedNames()).toEqual(["Ana Garcia", "Maria Santos"]);
  roster = [...roster, { student_id: "a", student_name: "Zoe Abel" }];
  act(() => membershipChanged());
  await screen.findByText("Zoe Abel");
  expect(displayedNames()).toEqual(["Zoe Abel", "Ana Garcia", "Maria Santos"]);
  confirm.mockRestore();
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


test("roster pagination stays in the selected classroom and starts a new class on page one", async () => {
  const roster = prefix => Array.from({ length: 12 }, (_, i) => ({ student_id: `${prefix}${i}`, student_name: `${prefix} student ${String(i).padStart(2, "0")}` }));
  supabase.rpc.mockResolvedValueOnce({ data: roster("A") }).mockResolvedValueOnce({ data: roster("B") });
  const { rerender } = render(<ClassroomRoster classroomId="A" />);
  await screen.findByText("A student 00");
  expect(screen.queryByText("A student 11")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("A student 11")).toBeInTheDocument();
  rerender(<ClassroomRoster classroomId="B" />);
  await screen.findByText("B student 00");
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  expect(screen.queryByText("A student 11")).not.toBeInTheDocument();
  expect(screen.queryByText("B student 11")).not.toBeInTheDocument();
});
