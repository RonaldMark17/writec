import { fireEvent, render, screen } from "@testing-library/react";
import StudentProfileSetup from "./StudentProfileSetup";

jest.mock("./ProfileEditor", () => ({ onClose, onSaved }) => <div>Complete your student profile<button onClick={onClose}>Later</button><button onClick={() => onSaved({ gradeLevel: "1st Year College", courseTrack: "BSIT", institution: "University" })}>Save</button></div>);
const profile = { id: "student", role: "student", account_status: "active" };
test("incomplete approved student is prompted and may dismiss for this visit", () => {
  render(<StudentProfileSetup profile={profile} />);
  expect(screen.getByText("Complete your student profile")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Later"));
  expect(screen.queryByText("Complete your student profile")).not.toBeInTheDocument();
});
test.each([{ role: "teacher" }, { account_status: "pending" }, { gradeLevel: "1st Year College", courseTrack: "BSIT", institution: "University" }])("does not prompt ineligible or complete profiles %j", (details) => {
  render(<StudentProfileSetup profile={{ ...profile, ...details }} />);
  expect(screen.queryByText("Complete your student profile")).not.toBeInTheDocument();
});
test("completed saved profile removes the setup prompt", () => {
  const saved = jest.fn();
  const { rerender } = render(<StudentProfileSetup profile={profile} onSaved={saved} />);
  fireEvent.click(screen.getByText("Save"));
  rerender(<StudentProfileSetup profile={{ ...profile, ...saved.mock.calls[0][0] }} onSaved={saved} />);
  expect(screen.queryByText("Complete your student profile")).not.toBeInTheDocument();
});
