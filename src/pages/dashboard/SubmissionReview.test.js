import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import SubmissionReview from "./SubmissionReview";
import copyleaksExample from "./__fixtures__/copyleaks-75-2.json";

jest.mock("./SubmissionFilePreview", () => props => <div data-testid="originals">{props.originalsOnly ? "Original pages only" : props.transcript}</div>);
jest.mock("./ClassmateMatches", () => () => <section aria-label="Classmate similarity">Peer matches</section>);
jest.mock("./AssignmentComments", () => () => <div>Comment threads</div>);
const essay = "First paragraph.\n\nContinuation and conclusion.";
test("actual 75.2% provider ranges render all categories and survive Sources / Plain / reload", () => {
  const { text, report, source } = copyleaksExample;
  const actions = props({text, result:report});
  let view = render(<SubmissionReview {...actions}/>);
  const check = () => {
    const transcription = view.container.querySelector("#review-transcription");
    expect(transcription.textContent).toBe(text);
    const marks = [...transcription.querySelectorAll("mark")];
    expect(marks).toHaveLength(25);
    expect(new Set(marks.map(mark => mark.dataset.matchTypes))).toEqual(new Set(["identical", "minorChanges", "relatedMeaning"]));
    for (const fragment of report.matchedSources[0].matching_fragments) {
      const mark = marks.find(item => item.textContent === text.slice(fragment.start, fragment.end));
      expect(mark).toHaveClass("essay-match");
      expect(mark).toHaveAttribute("data-source-ids", source.id);
    }
    expect(transcription.querySelector("mark mark")).toBeNull();
    return transcription;
  };
  expect(screen.getByText("75.2%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name:"Sources (1)"}));
  let transcription = check();
  fireEvent.click([...transcription.querySelectorAll("mark")].find(mark => mark.textContent.startsWith("Turnitin:")));
  expect(screen.getByRole("link", {name:"View Source"})).toHaveAttribute("href",source.url);
  fireEvent.click(screen.getByRole("button", {name:"Plain"}));
  expect(transcription.querySelector("mark")).toBeNull();
  expect(transcription.textContent).toBe(text);
  fireEvent.click(screen.getByRole("button", {name:"Sources (1)"}));
  check();
  expect(actions.onRecheck).not.toHaveBeenCalled();
  view.unmount();
  view = render(<SubmissionReview {...actions}/>);
  check();
  expect(actions.onRecheck).not.toHaveBeenCalled();
});
function props(extra = {}) {
  return { submission:{id:"work",studentName:"Alex",assignmentTitle:"Essay A",classroomName:"Class A",createdAt:"2026-10-10T02:32:00Z",processingState:"ready",transcribedText:essay},
    profile:{role:"teacher"}, onSaveText:jest.fn(async () => true), text:essay, onTextChange:jest.fn(), onRecheck:jest.fn(), onClose:jest.fn(), onCopy:jest.fn(), onExpandImage:jest.fn(),
    result:{score:24,transcribedText:essay,extractedText:essay,matchedSources:[{title:"Source",url:"https://example.com/paper",matched_words:12}]},
    grading:<input aria-label="Feedback" defaultValue=""/>, ...extra };
}
test("one read-only essay, prominent score and visible sources preserve grading drafts", () => {
  const actions = props(); render(<SubmissionReview {...actions}/>);
  const dialog = screen.getByRole("dialog", {name:"Alex"});
  expect(within(dialog).getAllByText("Alex", {exact:true})).toHaveLength(1);
  expect(dialog.querySelector("#review-transcription").textContent).toBe(essay);
  expect(screen.queryByRole("textbox", {name:"Edit extracted student work"})).not.toBeInTheDocument();
  expect(dialog.querySelectorAll("pre")).toHaveLength(0);
  expect(screen.getByTestId("originals")).toHaveTextContent("Original pages only");
  expect(screen.getByText("24%")).toHaveClass("text-6xl");
  expect(screen.getByRole("link", {name:"https://example.com/paper"})).toBeVisible();
  expect(screen.getByRole("region", {name:"Extracted Essay"}).compareDocumentPosition(screen.getByRole("region", {name:"Similarity Analysis"})) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Feedback"), {target:{value:"Keep this draft"}});
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
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
  expect(document.querySelector("#review-transcription").textContent).toBe("");
  if (state === "failed") {
    expect(screen.getByText("Similarity check failed")).toHaveAttribute("role","alert");
    fireEvent.click(screen.getByRole("button", {name:"Retry processing"}));
    expect(actions.onRecheck).toHaveBeenCalled();
  } else expect(screen.getByText(state === "submitted" ? "Text extraction is in progress." : "Extracted text is not available.")).toBeInTheDocument();
});
test("a genuine zero score remains zero and corrected text offers one recheck", () => {
  const actions = props({text:"Corrected words", result:{score:0}});
  render(<SubmissionReview {...actions}/>);
  expect(screen.getByText("0%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Re-run Similarity Check"}));
  expect(actions.onRecheck).toHaveBeenCalledTimes(1);
});

test("teacher cannot edit the essay", () => {
  const actions = props(); const { container } = render(<SubmissionReview {...actions}/>);
  expect(screen.queryByRole("button", {name:/Edit Student Work|Save Changes|Cancel/})).not.toBeInTheDocument();
  expect(container.querySelector("textarea, [contenteditable=true]")).toBeNull();
  expect(actions.onSaveText).not.toHaveBeenCalled();
});

test("student has no teacher action and stale evidence is hidden", () => {
  render(<SubmissionReview {...props({profile:{role:"student"},result:{score:24,stale:true,highlighted_sentences:[{sentence:"First paragraph."}]}})}/>);
  expect(screen.queryByRole("button", {name:"Edit Student Work"})).not.toBeInTheDocument();
  expect(screen.queryByText("24%")).not.toBeInTheDocument();
  expect(document.querySelector("mark")).toBeNull();
  expect(screen.getByText("No similarity result available")).toBeInTheDocument();
});

test("evidence arrives without hiding the essay and a new scan binds to edited text", () => {
  const actions = props({result:{score:24, transcribedText:essay, evidenceStatus:"loading"}});
  const { container, rerender } = render(<SubmissionReview {...actions}/>);
  expect(container.querySelector("#review-transcription").textContent).toBe(essay);
  expect(screen.getByText("Loading matching passages...")).toBeInTheDocument();
  const ready = {...actions.result, evidenceStatus:"ready", matchedSources:[{title:"Source", matching_fragments:[{start:0,end:15}]}]};
  rerender(<SubmissionReview {...actions} result={ready}/>);
  expect(container.querySelector("mark[role=button]").textContent).toBe("First paragraph");
  rerender(<SubmissionReview {...actions} text="Corrected essay." result={ready}/>);
  expect(container.querySelector("mark")).toBeNull();
  rerender(<SubmissionReview {...actions} text="Corrected essay." result={{score:12,transcribedText:"Corrected essay.",matchedSources:[{matching_fragments:[{start:0,end:9}]}]}}/>);
  expect(container.querySelector("mark[role=button]").textContent).toBe("Corrected");
});

 test("View Match focuses a multiline passage and opens its source details", async () => {
  const phrase = "paragraph.\n\nContinuation";
  const actions = props({result:{score:24, transcribedText:essay, matchedSources:[{id:"s",title:"Evidence source",url:"https://example.com",matching_fragments:[{matched_text:phrase}]}]}});
  const {container} = render(<SubmissionReview {...actions}/>);
  fireEvent.click(screen.getByRole("button", {name:"View Match"}));
  await waitFor(() => expect(document.activeElement).toHaveTextContent("paragraph. Continuation"));
  expect(await screen.findByRole("complementary", {name:"Selected match details"})).toBeVisible();
  expect(screen.getByRole("link", {name:"View Source"})).toHaveAttribute("href", "https://example.com");
  expect(container.querySelector("#review-transcription").textContent).toBe(essay);
  expect(container.querySelector("mark").textContent).toBe(phrase);
});

test.each([
  ["processing", "Checking similarity..."],
  ["failed", "Similarity check failed"],
])("%s hides a previous score and passage", (processingState, message) => {
  const actions = props();
  const {container} = render(<SubmissionReview {...actions} submission={{...actions.submission, processingState}}
    result={{...actions.result, highlighted_sentences:[{sentence:"First paragraph."}]}}/>);
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText("24%")).not.toBeInTheDocument();
  expect(container.querySelector("mark")).toBeNull();
});

test("saved results reload without submitting a new scan and missing evidence is explicit", () => {
  const actions = props();
  const first = render(<SubmissionReview {...actions}/>);
  expect(screen.getByText("Exact matching passages are not available for this result.")).toBeInTheDocument();
  first.unmount(); render(<SubmissionReview {...actions}/>);
  expect(screen.getByText("24%")).toBeInTheDocument();
  expect(actions.onRecheck).not.toHaveBeenCalled();
});


test.each([5, 100])("pending evidence at %s percent updates without a remount or rescan", score => {
  const text = "Arbitrary matched sentence. Another sentence.";
  const submission = { id: `new-${score}`, studentName: "Test", transcribedText: text, processingState: "ready" };
  const result = { score, transcribedText: text, evidenceStatus: "loading", matchedSources: [
    { id: `source-${score}`, title: "Arbitrary source", url: "https://example.org/source" },
  ] };
  const actions = props({ text, submission, result });
  const { container, rerender } = render(<SubmissionReview {...actions} />);
  expect(screen.getByText("Loading matching passages...")).toBeVisible();
  expect(container.querySelector("mark.essay-match")).toBeNull();
  const ready = { ...result, evidenceStatus: "ready", matchedSources: [{ ...result.matchedSources[0],
    matching_fragments: [{ start: 0, end: 27, matched_text: text.slice(0, 27), match_kind: "identical" }],
  }] };
  rerender(<SubmissionReview {...actions} result={ready} />);
  expect(screen.queryByText("Loading matching passages...")).not.toBeInTheDocument();
  expect(container.querySelector("mark.essay-match")).toHaveAttribute("data-source-ids", `source-${score}`);
  fireEvent.click(screen.getByRole("button", { name: "Plain" }));
  expect(container.querySelector("mark.essay-match")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sources (1)" }));
  expect(container.querySelector("mark.essay-match")).not.toBeNull();
  expect(actions.onRecheck).not.toHaveBeenCalled();
});

test("restored filters preserve one canonical essay and source identity without rescanning", async () => {
  const text = "First evidence. Peer passage. Last evidence.";
  const submission = {id:"a", studentId:"a", classroomId:"c", assignmentId:"t", studentName:"Alex", transcribedText:text};
  const sources = [
    {id:"one", title:"First source", url:"https://example.com/one", matched_text:"First evidence."},
    {id:"two", title:"Last source", url:"https://example.com/two", matched_text:"Last evidence."},
    {id:"three", title:"Third source"}, {id:"four", title:"Fourth source"}
  ];
  const actions = props({text, submission, submissions:[{id:"b", studentId:"b", classroomId:"c", assignmentId:"t"}],
    result:{score:34, transcribedText:text, matchedSources:sources, peerSimilarity:{all_matches:[{submission_id:"b",score_percent:41,matching_snippets:["Peer passage."]}]}},
    ocrEngineInfo:{yolo_model:"/models/detector.pt",trocr_model:"/models/recognizer"}});
  const {container} = render(<SubmissionReview {...actions}/>);
  expect(screen.getByText("4 External Sources")).toBeVisible();
  expect(screen.getByText("detector.pt + recognizer")).toBeVisible();
  const transcript = container.querySelector("#review-transcription");
  expect(transcript.querySelector(".essay-match-peer")).not.toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Sources (4)"}));
  expect(transcript.querySelector(".essay-match-peer")).toBeNull();
  expect(transcript.querySelectorAll("mark")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button",{name:"Plain"}));
  expect(transcript.querySelector("mark")).toBeNull();
  expect(transcript.textContent).toBe(text);
  expect(screen.queryByText(/Click any highlighted passage/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"All (5)"}));
  fireEvent.click(within(transcript).getByRole("button",{name:"Online Source Match: Last evidence."}));
  expect(screen.getByRole("link",{name:"View Source"})).toHaveAttribute("href","https://example.com/two");
  expect(container.querySelectorAll("#review-transcription")).toHaveLength(1);
  expect(transcript.textContent).toBe(text);
  expect(actions.onRecheck).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Plain"}));
  fireEvent.click(screen.getAllByRole("button",{name:"View Match"})[0]);
  await waitFor(() => expect(screen.getByRole("link",{name:"View Source"})).toHaveAttribute("href","https://example.com/one"));
});


test("submitted work X shares the Back handler without mutating review data", () => {
  const actions = props();
  const before = JSON.stringify({submission:actions.submission,result:actions.result,text:actions.text});
  render(<SubmissionReview {...actions}/>);
  fireEvent.change(screen.getByLabelText("Feedback"), {target:{value:"Draft feedback"}});
  const close = screen.getByRole("button", {name:"Close submitted work"});
  expect(close).toHaveAttribute("title", "Back to submissions");
  expect(close.querySelector("svg")).toBeInTheDocument();
  close.focus(); expect(close).toHaveFocus();
  fireEvent.click(close);
  expect(actions.onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", {name:/Back to submissions/}));
  expect(actions.onClose).toHaveBeenCalledTimes(2);
  expect(actions.onRecheck).not.toHaveBeenCalled();
  expect(actions.onSaveText).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Feedback")).toHaveValue("Draft feedback");
  expect(JSON.stringify({submission:actions.submission,result:actions.result,text:actions.text})).toBe(before);
});

test.each([{saving:true}, {scanning:true}])("both close controls respect existing busy state %j", busy => {
  const actions = props(busy); render(<SubmissionReview {...actions}/>);
  for (const name of ["Close submitted work", /Back to submissions/]) {
    const button = screen.getByRole("button", {name});
    expect(button).toBeDisabled(); fireEvent.click(button);
  }
  expect(actions.onClose).not.toHaveBeenCalled();
});
