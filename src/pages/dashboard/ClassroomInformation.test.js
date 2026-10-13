import { fireEvent, render, screen, within } from "@testing-library/react";
import ClassroomInformation, { ClassCode } from "./ClassroomInformation";

const classroom = { id: "private-id", name: "Class A", code: "ABC123", subject: "Research", teacher: "Teacher A", students: 32, teacherInfo: { email: "private@example.com" } };

test("information is read-only, scoped and does not navigate; Escape restores focus", async () => {
  const navigate = jest.fn();
  render(<div onClick={navigate}><ClassroomInformation classroom={classroom} /><ClassroomInformation classroom={{...classroom, name:"Class B", code:"XYZ987"}} /></div>);
  const trigger = screen.getByRole("button", {name:"Classroom information: Class A"});
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("ABC123")).toBeInTheDocument();
  for (const value of ["XYZ987", "private-id", "private@example.com", "Students"]) expect(within(dialog).queryByText(value)).not.toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole("button")).toHaveLength(2);
  fireEvent.keyDown(dialog, {key:"Escape"});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("copy uses exact current code and reports errors honestly", async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText}});
  const {rerender} = render(<ClassCode code="ABC123" />);
  fireEvent.click(screen.getByRole("button", {name:"Copy class code"}));
  await screen.findByText("Class code copied.");
  expect(writeText).toHaveBeenLastCalledWith("ABC123");
  rerender(<ClassCode code="XYZ987" />);
  expect(screen.queryByText("Class code copied.")).not.toBeInTheDocument();
  writeText.mockRejectedValueOnce(new Error("Denied"));
  fireEvent.click(screen.getByRole("button", {name:"Copy class code"}));
  await screen.findByText(/Could not copy/);
  expect(writeText).toHaveBeenLastCalledWith("XYZ987");
});

test("teacher information includes known count and archive status", () => {
  render(<ClassroomInformation classroom={{...classroom, isArchived:true}} teacherView />);
  fireEvent.click(screen.getByRole("button", {name:/Classroom information:/}));
  expect(screen.getByText("32")).toBeInTheDocument();
  expect(screen.getByText("Archived")).toBeInTheDocument();
});
