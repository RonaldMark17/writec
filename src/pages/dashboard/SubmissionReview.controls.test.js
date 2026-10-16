import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubmissionReview from "./SubmissionReview";
import { checkPeerSimilarityViaBackend } from "./plagiarismScan";
import { apiFetch } from "../../apiFetch";

jest.mock("./plagiarismScan", () => ({ checkPeerSimilarityViaBackend: jest.fn() }));
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));
jest.mock("./SubmissionFilePreview", () => () => <p>Original submission</p>);
jest.mock("./AssignmentComments", () => () => <p>Comments</p>);

const text = "External evidence. Peer evidence. Unmatched conclusion.";
const submission = { id:"work", studentId:"a", studentName:"Alex", assignmentId:"assignment", classroomId:"class", assignmentTitle:"Essay", processingState:"ready", transcribedText:text };
const sources = Array.from({length:10}, (_, i) => ({id:`source-${i}`, title:`Reference ${i + 1}`, url:`https://example.com/${i}`, ...(i === 0 ? {matching_fragments:[{start:0,end:18}]} : {})}));
const peer = {submission_id:"peer", student_name:"Sam", score_percent:34, matching_snippets:["Peer evidence."]};
function setup(result = {}, extra = {}) {
  const actions = {submission, text, submissions:[{id:"peer",studentId:"b",classroomId:"class",assignmentId:"assignment"}],
    result:{score:100, transcribedText:text, matchedSources:sources, peerSimilarity:{all_matches:[peer]}, ...result},
    onClose:jest.fn(), onRecheck:jest.fn(), onCopy:jest.fn(), grading:<textarea aria-label="Teacher feedback" />, ...extra};
  return {actions, ...render(<SubmissionReview {...actions} />)};
}
function capture(name) {
  if (!process.env.WC_CAPTURE_DIR) return;
  const fs = require("fs"), path = require("path");
  fs.mkdirSync(process.env.WC_CAPTURE_DIR, {recursive:true});
  fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR, `${name}.body.html`), document.body.innerHTML);
}
beforeEach(() => jest.clearAllMocks());

test("every source control opens the same saved interface with keyboard activation and no requests", () => {
  const {actions} = setup();
  fireEvent.change(screen.getByLabelText("Teacher feedback"), {target:{value:"Draft stays here"}});
  capture("teacher-review-matches");
  for (const [i, name] of ["View sources", "10 External Sources", "External sources (10)", "10 matching sources"].entries()) {
    const trigger = screen.getByRole("button", {name});
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    trigger.focus(); userEvent.keyboard(i % 2 ? " " : "{Enter}");
    const dialog = screen.getByRole("dialog", {name:"Sources and peer matches"});
    expect(screen.getAllByRole("dialog", {name:"Sources and peer matches"})).toHaveLength(1);
    expect(within(dialog).getByText("Reference 1")).toBeVisible();
    expect(within(dialog).getByText("Sam")).toBeInTheDocument();
    capture("teacher-review-sources");
    fireEvent.keyDown(dialog, {key:"Escape"});
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("Teacher feedback")).toHaveValue("Draft stays here");
  }
  expect(actions.onRecheck).not.toHaveBeenCalled();
  expect(checkPeerSimilarityViaBackend).not.toHaveBeenCalled();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("peer summary jumps to saved peer matches and filters only existing ranges", () => {
  const {container, actions} = setup();
  expect(within(screen.getByRole("region", {name:"Peer similarity"})).getByText("1 matching classmate")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name:"View peer matches"}));
  expect(screen.getByLabelText("Saved peer comparison")).toHaveFocus();
  expect(screen.getByRole("button", {name:"Inspect match with Sam"})).toBeVisible();
  capture("teacher-review-peer-details");
  fireEvent.keyDown(screen.getByRole("dialog", {name:"Sources and peer matches"}), {key:"Escape"});
  fireEvent.click(screen.getByRole("button", {name:"Peer matches"}));
  expect(screen.getByRole("button", {name:"Peer matches"})).toHaveAttribute("aria-pressed", "true");
  expect([...container.querySelectorAll("mark")].map(mark => mark.textContent)).toEqual(["Peer evidence."]);
  fireEvent.click(screen.getByRole("button", {name:"Plain text"}));
  expect(container.querySelector("mark")).toBeNull();
  expect(container.querySelector("#review-transcription")).toHaveTextContent(text);
  fireEvent.click(screen.getByRole("button", {name:"All highlights"}));
  expect(container.querySelectorAll("mark")).toHaveLength(2);
  expect(actions.onRecheck).not.toHaveBeenCalled();
  expect(checkPeerSimilarityViaBackend).not.toHaveBeenCalled();
});

test.each([
  [{peerSimilarity:{all_matches:[]}}, "No reportable matches"],
  [{peerComparisonEnabled:false,peerSimilarity:null}, "Comparison disabled"],
  [{peerSimilarity:null}, "Not checked"],
  [{stale:true}, "Awaiting current check"],
])("peer summary preserves the saved availability state %j", (result, status) => {
  setup(result);
  const summary = screen.getByRole("region", {name:"Peer similarity"});
  expect(within(summary).getByText(status)).toBeVisible();
  expect(within(summary).queryByText(/\d+%/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name:"Peer matches"})).not.toBeInTheDocument();
  capture(`teacher-review-${status.replaceAll(" ", "-")}`);
  fireEvent.click(screen.getByRole("button", {name:"View peer comparison"}));
  expect(screen.getByLabelText("Saved peer comparison")).toHaveFocus();
  expect(checkPeerSimilarityViaBackend).not.toHaveBeenCalled();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("a saved peer score without ranges offers inspection without a fake highlight filter", () => {
  setup({peerSimilarity:{all_matches:[{...peer, matching_snippets:[]}]}});
  expect(screen.getByRole("button", {name:"View peer matches"})).toBeVisible();
  expect(screen.queryByRole("button", {name:"Peer matches"})).not.toBeInTheDocument();
});
