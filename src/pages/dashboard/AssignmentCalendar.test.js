import { fireEvent, render, screen } from "@testing-library/react";
import AssignmentCalendar, { calendarDateKey } from "./AssignmentCalendar";

test("calendar navigates months, opens assignments, and includes undated work", () => {
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), 15, 10);
  const open = jest.fn(), change = jest.fn();
  const assignment = { id: "a", title: "Essay", classroomId: "A", dueDate: due.toISOString(), classroomName: "English" };
  render(<AssignmentCalendar assignments={[assignment, { id: "b", title: "Reading", classroomId: "A" }, { ...assignment, id: "c", title: "Archived", isArchived: true }]}
    classrooms={[{ id: "A", name: "English", section: "A" }]} onOpenAssignment={open} onClassroomChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: /Essay English/ }));
  expect(open).toHaveBeenCalledWith(assignment);
  expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Assignments without a deadline" })).toHaveTextContent("Reading");
  fireEvent.click(screen.getByLabelText("Next month"));
  expect(screen.queryByRole("button", { name: /Essay English/ })).not.toBeInTheDocument();
  expect(screen.getByText("No deadlines this month.")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Previous month"));
  expect(screen.getByRole("button", { name: /Essay English/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Calendar classroom"), { target: { value: "A" } });
  expect(change).toHaveBeenCalledWith("A");
  expect(calendarDateKey(due.toISOString())).toBe(`${due.getFullYear()}-${due.getMonth()}-15`);
  expect(calendarDateKey("invalid")).toBe("");
});
