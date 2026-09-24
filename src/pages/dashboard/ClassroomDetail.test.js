import { fireEvent, render, screen } from "@testing-library/react";
import ClassroomDetail from "./ClassroomDetail";

jest.mock("./ClassroomRoster", () => ({ classroomId }) => <div>Roster for {classroomId}</div>);

test("shows only this classroom's homework and switches to its members", () => {
  const open = jest.fn();
  const back = jest.fn();
  const assignments = [
    { id: "a1", classroomId: "c1", title: "English essay" },
    { id: "a2", classroomId: "c2", title: "Biology report" },
  ];
  render(<ClassroomDetail classroom={{ id: "c1", name: "English", section: "A" }} assignments={assignments} onBack={back} onOpenAssignment={open} />);
  expect(screen.getByText("English essay")).toBeInTheDocument();
  expect(screen.queryByText("Biology report")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /English essay/ }));
  expect(open).toHaveBeenCalledWith(assignments[0]);
  fireEvent.click(screen.getByRole("button", { name: "Members" }));
  expect(screen.getByText("Roster for c1")).toBeInTheDocument();
  expect(screen.queryByText("English essay")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Homework" }));
  expect(screen.getByText("English essay")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back to classes/ }));
  expect(back).toHaveBeenCalled();
});

test("provides an empty state and teacher create action", () => {
  const create = jest.fn();
  render(<ClassroomDetail classroom={{ id: "c1", name: "English" }} assignments={[]} onCreateAssignment={create} />);
  expect(screen.getByText("No homework posted in this classroom yet.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));
  expect(create).toHaveBeenCalled();
});
