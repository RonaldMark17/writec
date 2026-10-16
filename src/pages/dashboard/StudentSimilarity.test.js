import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudentSimilarity from "./StudentSimilarity";
import { apiFetch } from "../../apiFetch";
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));
const submission = { id: "own" };
const report = { state: "ready", score: 24, sources: [{title:"Actual source",url:"https://example.com",domain:"example.com"}], peers:[{score:68}],passages:[] };
function respond(data) { apiFetch.mockResolvedValue({ok:true,json:async()=>data}); }
beforeEach(() => { jest.clearAllMocks(); respond(report); });
test("starts compact, independently opens sections and uses saved result on remount", async () => {
  const view = render(<StudentSimilarity submission={submission} />);
  await screen.findByText("24% Similarity");
  expect(screen.queryByText("Detected Sources")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", {name:"View similarity details"}); trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", {name:"Similarity Details"})).toHaveFocus();
  expect(screen.getByRole("button", {name:"View similarity details"})).toHaveAttribute("aria-expanded","true");
  const sources = screen.getByText("Detected Sources").closest("details");
  const peers = screen.getByText("Peer Similarity").closest("details");
  expect(sources).toHaveAttribute("open"); expect(peers).not.toHaveAttribute("open");
  expect(sources).toHaveAttribute("open"); expect(peers).not.toHaveAttribute("open");
  expect(screen.getByText("Actual source")).toBeVisible();
  expect(screen.queryByText("Matching Passages")).not.toBeInTheDocument();
  fireEvent.click(peers.querySelector("summary"));
  expect(screen.getByText(/Similarity: 68%/)).toBeVisible();
  const sourceLink = screen.getByRole("link", {name:/Open source/});
  expect(sourceLink).toHaveAttribute("href", "https://example.com");
  expect(screen.queryByText("https://example.com")).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog", {name:"Similarity Details"}), {key:"Escape"});
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount(); render(<StudentSimilarity submission={submission} />);
  await screen.findByText("24% Similarity");
  expect(screen.getByRole("button",{name:"View similarity details"})).toHaveAttribute("aria-expanded","false");
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(apiFetch.mock.calls[0][0]).toBe("/api/submissions/own/similarity");
});
test.each(["processing","failed","unavailable"])("%s never becomes zero similarity", async state => {
  respond({state}); render(<StudentSimilarity submission={submission} />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  if (state === "failed") await screen.findByRole("alert");
  if (state === "unavailable") await screen.findByText(/verified similarity result is not available/);
  expect(screen.queryByText("0% Similarity")).not.toBeInTheDocument();
});
test("real zero displays and absent detail sections stay hidden", async () => {
  respond({state:"ready",score:0,sources:[],peers:[],passages:[]});
  render(<StudentSimilarity submission={submission} />);
  await screen.findByText("0% Similarity"); fireEvent.click(screen.getByRole("button",{name:"View similarity details"}));
  expect(screen.queryByText("Detected Sources")).not.toBeInTheDocument();
  expect(screen.queryByText("Peer Similarity")).not.toBeInTheDocument();
});
test("classroom result has no fabricated external percentage", async () => {
  respond({...report,score:null,sources:[],mode:"classroom"});render(<StudentSimilarity submission={submission} />);
  await screen.findByText(/classroom comparison only/);
  expect(screen.queryByText("0% Similarity")).not.toBeInTheDocument();
});

test("processing polls saved status then stops after completion", async () => {
  jest.useFakeTimers();
  try {
    apiFetch.mockResolvedValueOnce({ok:true,json:async()=>({state:"processing"})})
      .mockResolvedValue({ok:true,json:async()=>report});
    const view = render(<StudentSimilarity submission={submission} />);
    await act(async () => {});
    expect(screen.getByText("Checking submission for similarity...")).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.getByText("24% Similarity")).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    view.unmount();
  } finally { jest.useRealTimers(); }
});
test("a late response for the previous submission cannot replace the current result", async () => {
  let resolveFirst;
  apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValue({ok:true,json:async()=>({...report,score:42})});
  const view = render(<StudentSimilarity submission={submission} />);
  view.rerender(<StudentSimilarity submission={{id:"second"}} />);
  await screen.findByText("42% Similarity");
  await act(async () => resolveFirst({ok:true,json:async()=>report}));
  expect(screen.queryByText("24% Similarity")).not.toBeInTheDocument();
});
