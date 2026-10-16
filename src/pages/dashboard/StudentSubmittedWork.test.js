import { fireEvent, render, screen, within } from "@testing-library/react";
import StudentSubmissionReview from "./StudentSubmissionReview";
import { apiFetch } from "../../apiFetch";
import { downloadSubmissionFileBlob } from "./shared";

jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("./shared", () => ({ formatDateTime: value => value || "No due date", DownloadIcon: () => null, downloadSubmissionFileBlob: jest.fn() }));
jest.mock("./AssignmentComments", () => () => <p>Private comments</p>);
const submission = { id:"work", assignmentTitle:"Review Article", classroomName:"Writing Class", classroomSubject:"Writing Class", createdAt:"2026-10-15", fileUrl:"student/article.txt" };
function capture(name) {
  if (!process.env.WC_CAPTURE_DIR) return;
  const fs = require("fs"), path = require("path");
  fs.mkdirSync(process.env.WC_CAPTURE_DIR, {recursive:true});
  fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR, `${name}.body.html`), document.body.innerHTML);
}
beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:text"); URL.revokeObjectURL = jest.fn();
  const blob = new Blob(["Essay text"]); blob.text = async () => "A readable submitted essay.\n\n".repeat(35);
  downloadSubmissionFileBlob.mockResolvedValue(blob);
});

test.each([0,1,3])("compact text review with %i sources preserves detail links and focus", async count => {
  apiFetch.mockResolvedValue({ok:true,json:async()=>({state:"ready",score:count ? 75.2 : 0,
    sources:Array.from({length:count},(_,i)=>({title:`Reference ${i+1}`,domain:"example.com",url:`https://example.com/article/${i}`,matched_words:167})),
    passages:[{text:"A matching passage"}],peers:[{score:31}]})});
  render(<StudentSubmissionReview submission={submission} onClose={jest.fn()} />);
  expect(await screen.findByText(`${count ? 75.2 : 0}% Similarity`)).toBeVisible();
  expect(screen.getByText(`${count} matching source${count === 1 ? "" : "s"}`)).toBeVisible();
  expect(await screen.findByLabelText("Submitted document text")).toHaveAttribute("tabindex","0");
  expect(screen.getByRole("link",{name:"Download submission"})).toHaveAttribute("download","article.txt");
  expect(screen.getAllByRole("heading",{name:"Review Article"})).toHaveLength(1);
  expect(screen.getByText(/Writing Class/).textContent.match(/Writing Class/g)).toHaveLength(1);
  expect(screen.queryByRole("region",{name:"Teacher feedback"})).not.toBeInTheDocument();
  const summary = screen.getByRole("region", {name:"Submission summary"});
  expect(within(summary).getAllByText("Submitted")).toHaveLength(1);
  expect(within(summary).getByText("Awaiting teacher review")).toBeVisible();
  expect(within(summary).getByText("Not graded yet")).toBeVisible();
  expect(screen.queryByText("Reference 1")).not.toBeInTheDocument();
  capture(`student-text-${count}-sources`);
  const trigger=screen.getByRole("button",{name:"View similarity details"}); trigger.focus();fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Similarity Details"});expect(dialog).toHaveFocus();
  if(count) {
    expect(within(dialog).getAllByRole("link",{name:/Open source/})).toHaveLength(count);
    expect(within(dialog).getAllByRole("link")[0]).toHaveAttribute("href","https://example.com/article/0");
    expect(within(dialog).queryByText(/https:\/\//)).not.toBeInTheDocument();
  }
  fireEvent.click(within(dialog).getByText("Matching Passages"));
  expect(within(dialog).getByText("A matching passage")).toBeVisible();
  capture(`student-source-dialog-${count}`);
  fireEvent.keyDown(dialog,{key:"Tab"});expect(within(dialog).getByRole("button",{name:"Close similarity details"})).toHaveFocus();
  fireEvent.keyDown(dialog,{key:"Escape"});expect(trigger).toHaveFocus();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

test("returned feedback without a grade stays compact and visible", async () => {
  apiFetch.mockResolvedValue({ok:true,json:async()=>({state:"unavailable"})});
  render(<StudentSubmissionReview submission={{...submission,returnedAt:"2026-10-16",feedback:"Please clarify the conclusion."}} onClose={jest.fn()} />);
  await screen.findByLabelText("Submitted document text");
  expect(screen.getByText("Returned without a grade")).toBeVisible();
  expect(screen.getByRole("region",{name:"Teacher feedback"})).toHaveTextContent("Please clarify the conclusion.");
  capture("student-returned-feedback-only");
});

 test("closing nested dialogs together restores background interaction and scrolling", async () => {
  apiFetch.mockResolvedValue({ok:true,json:async()=>({state:"ready",score:0})});
  const originalOverflow = document.body.style.overflow;
  const view = render(<StudentSubmissionReview submission={submission} onClose={jest.fn()} />);
  await screen.findByText("0% Similarity");
  fireEvent.click(screen.getByRole("button",{name:"View similarity details"}));
  expect(view.container.inert).toBe(true);
  view.unmount();
  expect(view.container.inert).toBe(false);
  expect(document.body.style.overflow).toBe(originalOverflow);
 });
