import { fireEvent, render, screen, within } from "@testing-library/react";
import SubmissionReview from "./SubmissionReview";

jest.mock("./SubmissionFilePreview", () => props => <div data-testid="originals">{props.originalsOnly ? "Original pages only" : props.transcript}</div>);
jest.mock("./ClassmateMatches", () => () => <section aria-label="Classmate similarity">Peer matches</section>);
jest.mock("./AssignmentComments", () => () => <div>Comment threads</div>);
const essay = "First paragraph.\n\nContinuation and conclusion.";
function props(extra = {}) {
  return { submission:{id:"work",studentName:"Alex",assignmentTitle:"Essay A",classroomName:"Class A",createdAt:"2026-10-10T02:32:00Z",processingState:"ready",transcribedText:essay},
    profile:{role:"teacher"}, onSaveText:jest.fn(async () => true), text:essay, onTextChange:jest.fn(), onRecheck:jest.fn(), onClose:jest.fn(), onCopy:jest.fn(), onExpandImage:jest.fn(),
    result:{score:24,transcribedText:essay,extractedText:essay,matchedSources:[{title:"Source",url:"https://example.com/paper",matched_words:12}]},
    grading:<input aria-label="Feedback" defaultValue=""/>, ...extra };
}
test("one canonical essay, compact metadata and collapsed similarity; disclosures preserve drafts", () => {
  const actions = props(); render(<SubmissionReview {...actions}/>);
  const dialog = screen.getByRole("dialog", {name:"Alex"});
  expect(within(dialog).getAllByText("Alex", {exact:true})).toHaveLength(1);
  expect(dialog.querySelector("#review-transcription").textContent).toBe(essay);
  expect(screen.queryByRole("textbox", {name:"Edit extracted student work"})).not.toBeInTheDocument();
  expect(dialog.querySelectorAll("pre")).toHaveLength(0);
  expect(screen.getByTestId("originals")).toHaveTextContent("Original pages only");
  expect(screen.getByText("View similarity details").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("region", {name:"Extracted Essay"}).compareDocumentPosition(screen.getByRole("region", {name:"Similarity Analysis"})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Feedback"), {target:{value:"Keep this draft"}});
  fireEvent.click(screen.getByText("View similarity details"));
  fireEvent.click(screen.getByText("Class and private comments"));
  expect(screen.getByLabelText("Feedback")).toHaveValue("Keep this draft");
  fireEvent.click(screen.getByRole("button", {name:"Copy text"}));
  expect(actions.onCopy).toHaveBeenCalledWith(essay);
  fireEvent.click(screen.getByRole("button", {name:/Back to submissions/}));
  expect(actions.onClose).toHaveBeenCalled();
});
test.each(["submitted", "failed", "ready"])("%s without results never displays a fake zero or blank successful OCR", state => {
  const actions = props({text:"",result:null,submission:{id:"work",studentName:"Alex",processingState:state,processingError:state === "failed" ? "Page 2 failed" : null}});
  render(<SubmissionReview {...actions}/>);
  expect(screen.queryByText("0% Similarity")).not.toBeInTheDocument();
  expect(document.querySelector("#review-transcription").textContent).toBe("");
  if (state === "failed") {
    expect(screen.getByText("Page 2 failed")).toHaveAttribute("role","alert");
    fireEvent.click(screen.getByRole("button", {name:"Retry processing"}));
    expect(actions.onRecheck).toHaveBeenCalled();
  } else expect(screen.getByText(state === "submitted" ? "Text extraction is in progress." : "Extracted text is not available.")).toBeInTheDocument();
});
test("a genuine zero score remains zero and corrected text offers one recheck", () => {
  const actions = props({text:"Corrected words", result:{score:0}});
  render(<SubmissionReview {...actions}/>);
  expect(screen.getByText("0% Similarity")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Re-run Similarity Check"}));
  expect(actions.onRecheck).toHaveBeenCalledTimes(1);
});

test("explicit editing supports cancel and successful save", async () => {
  const actions = props(); render(<SubmissionReview {...actions}/>);
  fireEvent.click(screen.getByRole("button", {name:"Edit Student Work"}));
  fireEvent.change(screen.getByRole("textbox", {name:"Edit extracted student work"}), {target:{value:"Corrected"}});
  expect(actions.onTextChange).toHaveBeenCalledWith("Corrected");
  fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
  expect(actions.onTextChange).toHaveBeenLastCalledWith(essay);
  fireEvent.click(screen.getByRole("button", {name:"Edit Student Work"}));
  fireEvent.click(screen.getByRole("button", {name:"Save Changes"}));
  expect(actions.onSaveText).toHaveBeenCalledTimes(1);
  await screen.findByRole("button", {name:"Edit Student Work"});
});

test("student has no teacher action and stale evidence is hidden", () => {
  render(<SubmissionReview {...props({profile:{role:"student"},result:{score:24,stale:true,highlighted_sentences:[{sentence:"First paragraph."}]}})}/>);
  expect(screen.queryByRole("button", {name:"Edit Student Work"})).not.toBeInTheDocument();
  expect(screen.queryByText("24% Similarity")).not.toBeInTheDocument();
  expect(document.querySelector("mark")).toBeNull();
  expect(screen.getByText(/generated before the extracted text was edited/)).toBeInTheDocument();
});

test("evidence arrives without hiding the essay and a new scan binds to edited text", () => {
  const actions = props({result:{score:24, transcribedText:essay, evidenceStatus:"loading"}});
  const { container, rerender } = render(<SubmissionReview {...actions}/>);
  expect(container.querySelector("#review-transcription").textContent).toBe(essay);
  expect(screen.getByText("Loading saved matching passages...")).toBeInTheDocument();
  const ready = {...actions.result, evidenceStatus:"ready", matchedSources:[{title:"Source", matching_fragments:[{start:0,end:15}]}]};
  rerender(<SubmissionReview {...actions} result={ready}/>);
  expect(container.querySelector("mark[role=button]").textContent).toBe("First paragraph");
  rerender(<SubmissionReview {...actions} text="Corrected essay." result={ready}/>);
  expect(container.querySelector("mark")).toBeNull();
  rerender(<SubmissionReview {...actions} text="Corrected essay." result={{score:12,transcribedText:"Corrected essay.",matchedSources:[{matching_fragments:[{start:0,end:9}]}]}}/>);
  expect(container.querySelector("mark[role=button]").textContent).toBe("Corrected");
});
