import { fireEvent, render, screen, within } from "@testing-library/react";
import StudentSubmissionReview from "./StudentSubmissionReview";
import { downloadSubmissionFileBlob } from "./shared";
import { apiFetch } from "../../apiFetch";
jest.mock("./shared", () => ({ formatDateTime: value => value || "—", DownloadIcon: () => null, downloadSubmissionFileBlob: jest.fn() }));
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn(), getBackendUrl: () => "" }));
jest.mock("./StudentSimilarity", () => () => <p>Safe similarity result</p>);
jest.mock("./AssignmentComments", () => () => <textarea aria-label="Private comment" />);
const base = { id:"work", assignmentId:"assignment", classroomId:"class", assignmentTitle:"Essay Activity 1", essayTitle:"My essay", createdAt:"2026-10-15", fileUrl:"student/essay.png" };
beforeEach(() => { jest.clearAllMocks(); URL.createObjectURL = jest.fn(() => "blob:preview"); URL.revokeObjectURL = jest.fn(); downloadSubmissionFileBlob.mockResolvedValue(new Blob(["image"])); });
function capture(name) {
  if (!process.env.WC_CAPTURE_DIR) return;
  const fs = require("fs"), path = require("path"); fs.mkdirSync(process.env.WC_CAPTURE_DIR, {recursive:true});
  fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR, `${name}.body.html`), document.body.innerHTML.replaceAll('src="blob:preview"', 'src="data:image/svg+xml,%3Csvg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;600&quot; height=&quot;800&quot; viewBox=&quot;0 0 600 800&quot;%3E%3Crect width=&quot;600&quot; height=&quot;800&quot; fill=&quot;white&quot;/%3E%3Ctext x=&quot;50&quot; y=&quot;80&quot; font-size=&quot;24&quot;%3ESubmitted essay preview%3C/text%3E%3C/svg%3E"'));
}
test.each([
  [{}, "Submitted", "Awaiting teacher review"],
  [{returnedAt:"2026-10-16",grade:"92 / 100",feedback:"Good conclusion"}, "Returned", "92 / 100"],
  [{revisionRequest:{message:"Correct paragraph two"}}, "Resubmission Requested", "Correct paragraph two"],
  [{revisionHistory:[{id:"r",completed_at:"2026-10-16",requested_at:"2026-10-15"}]}, "Resubmitted", "Awaiting teacher review"],
  [{returnedAt:"2026-10-17",grade:0,feedback:"Latest feedback",revisionHistory:[{id:"r",completed_at:"2026-10-16"}]}, "Returned", "0"],
])("submission workflow %j", async (extra, status, content) => {
  const onResubmit = extra.revisionRequest ? jest.fn() : undefined;
  render(<StudentSubmissionReview submission={{...base,...extra}} onResubmit={onResubmit} onClose={jest.fn()} />);
  expect(within(screen.getByRole("region",{name:"Submission summary"})).getByText(status)).toBeVisible(); expect(screen.getByText(content)).toBeVisible();
  await screen.findByRole("button",{name:"Preview page 1"});
  expect(screen.queryByText(/YOLO|TrOCR|Pipeline|best.pt/)).not.toBeInTheDocument();
  if(onResubmit) { fireEvent.click(screen.getByRole("button",{name:"Resubmit Work"})); expect(onResubmit).toHaveBeenCalledTimes(1); }
  else expect(screen.queryByRole("button",{name:"Resubmit Work"})).not.toBeInTheDocument();
  capture(`student-${status.replaceAll(" ","-")}-${extra.grade ?? "pending"}`.replaceAll("/","-"));
});
test("unreleased grades stay hidden and current attempt replaces old files and feedback", async () => {
  const view=render(<StudentSubmissionReview submission={{...base,grade:99,feedback:"Private draft",status:"graded"}} onClose={jest.fn()} />);
  expect(screen.queryByText("99")).not.toBeInTheDocument(); expect(screen.queryByText("Private draft")).not.toBeInTheDocument();
  await screen.findByRole("button",{name:"Preview page 1"});
  view.rerender(<StudentSubmissionReview submission={{...base,fileUrl:"student/revised.png",grade:95,feedback:"Latest feedback",returnedAt:"2026-10-17"}} onClose={jest.fn()} />);
  expect(screen.getByText("95")).toBeVisible();expect(screen.getByText("Latest feedback")).toBeVisible();
  await screen.findByText("revised.png");expect(screen.queryByText("essay.png")).not.toBeInTheDocument();
});
test("multipage files sort, expand in place, navigate, trap focus and restore it", async () => {
  apiFetch.mockImplementation(url => Promise.resolve(url.includes("&page_number=") ? {ok:true,blob:async()=>new Blob(["page"])} : {ok:true,json:async()=>({pages:[{page_number:2,name:"second.png"},{page_number:1,name:"first.png"}]})}));
  const onClose=jest.fn(); render(<StudentSubmissionReview submission={{...base,fileUrl:"essay.essay.zip"}} onClose={onClose} />);
  const first=await screen.findByRole("button",{name:"Preview page 1"});
  expect(screen.getAllByRole("img").map(e=>e.alt)).toEqual(["Your submitted work, page 1","Your submitted work, page 2"]);
  capture("student-multipage"); first.focus();fireEvent.click(first);
  const dialog=screen.getByRole("dialog",{name:"Page 1 of 2"});expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog,{key:"Tab"});expect(within(dialog).getByRole("button",{name:"Close submitted work"})).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button",{name:"Next page"}));expect(screen.getByRole("dialog",{name:"Page 2 of 2"})).toBeInTheDocument();
  capture("student-lightbox");fireEvent.keyDown(dialog,{key:"Escape"});expect(first).toHaveFocus();expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Class and private comments"));expect(screen.getByLabelText("Private comment")).toBeVisible();
});
test("failed files offer a safe retry and missing files have an empty state", async () => {
  downloadSubmissionFileBlob.mockRejectedValueOnce(new Error("secret API id"));
  const view=render(<StudentSubmissionReview submission={base} onClose={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button",{name:"Try Again"}));await screen.findByRole("button",{name:"Preview page 1"});
  expect(screen.queryByText("secret API id")).not.toBeInTheDocument();
  view.rerender(<StudentSubmissionReview submission={{...base,fileUrl:null}} onClose={jest.fn()} />);
  expect(screen.getByText("No submitted files available.")).toBeVisible();
});
