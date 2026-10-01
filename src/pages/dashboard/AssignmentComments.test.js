import { fireEvent, render, screen, within } from "@testing-library/react";
import AssignmentComments from "./AssignmentComments";
import { supabase } from "../../supabaseClient";
jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));
beforeEach(() => jest.resetAllMocks());

test.each([['class', 'Class Comment', 'Post class comment'], ['private', 'Private Comment', 'Post private comment']])("posts a %s comment with exact scope", async (kind, label, button) => {
  let posted = false;
  supabase.rpc.mockImplementation((name) => {
    if (name === "post_assignment_comment") { posted = true; return Promise.resolve({ data: "comment" }); }
    return Promise.resolve({ data: posted ? [{ id: "comment", sender_name: "Alex Santos", visibility: kind, comment_text: "My question", created_at: "2026-01-01" }] : [] });
  });
  render(<AssignmentComments assignmentId="a" classroomId="A" profile={{ id: "s", role: "student" }} />);
  await screen.findAllByText("No comments yet.");
  fireEvent.change(screen.getByLabelText(label), { target: { value: "My question" } });
  fireEvent.click(screen.getByRole("button", { name: button }));
  expect(await screen.findByText("Alex Santos")).toBeInTheDocument();
  expect(supabase.rpc).toHaveBeenCalledWith("post_assignment_comment", { requested_assignment_id: "a", requested_classroom_id: "A", comment_text: "My question", comment_kind: kind, recipient_student_id: null });
});

test("teacher selects the private conversation and replies to that student", async () => {
  supabase.rpc.mockImplementation(name => Promise.resolve({ data: name === "get_classroom_roster" ? [{ student_id: "s", student_name: "Alex" }, { student_id: "other", student_name: "Sam" }]
    : [{ id: "c", student_id: "s", sender_name: "Alex", visibility: "private", comment_text: "Private question", created_at: "2026-01-01" }] }));
  const { rerender } = render(<AssignmentComments assignmentId="a" classroomId="A" profile={{ role: "teacher" }} />);
  await screen.findByText("Select a student to view or reply privately.");
  fireEvent.change(screen.getByLabelText("Student conversation"), { target: { value: "s" } });
  expect(screen.getByText("Private question")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Class Comments" })).queryByText("Private question")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Private Comment"), { target: { value: "Teacher reply" } });
  fireEvent.click(screen.getByRole("button", { name: "Reply privately" }));
  await screen.findByText("Private question");
  expect(supabase.rpc).toHaveBeenCalledWith("post_assignment_comment", expect.objectContaining({ recipient_student_id: "s", comment_kind: "private", comment_text: "Teacher reply" }));
  supabase.rpc.mockResolvedValue({ data: [] });
  rerender(<AssignmentComments assignmentId="b" classroomId="B" profile={{ role: "teacher" }} />);
  await screen.findByText("No comments yet.");
  expect(screen.queryByText("Private question")).not.toBeInTheDocument();
});
