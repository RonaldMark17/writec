import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PeerComparison, phraseRanges } from "./PeerSimilarityReview";
import ClassmateMatches from "./ClassmateMatches";
import { checkPeerSimilarityViaBackend } from "./plagiarismScan";
jest.mock("./plagiarismScan", () => ({ checkPeerSimilarityViaBackend: jest.fn() }));
jest.mock("./shared", () => ({ formatDateTime: value => value }));
const submission = { id: "a", classroomId: "class", assignmentId: "assignment" };
const pair = {
  assignment_title: "Essay Demo", classroom_name: "English", score_percent: 84,
  matching_snippets: ["students learn by sharing ideas"],
  left: { submission_id: "a", student_name: "Juan Dela Cruz", submitted_at: "2026-10-08T02:00:00Z", status: "submitted", text: "Introduction. Students learn by sharing ideas. A unique conclusion." },
  right: { submission_id: "b", student_name: "Maria Santos", submitted_at: "2026-10-08T02:30:00Z", status: "graded", text: "Students learn by sharing ideas! Another ending." },
};
beforeEach(() => jest.resetAllMocks());

test("inspect opens saved answers and highlights only verified common phrases in both", async () => {
  checkPeerSimilarityViaBackend.mockImplementation(args => Promise.resolve(args.matchedSubmissionId ? pair
    : { total_peers_compared: 1, all_matches: [{ submission_id: "b", student_name: "Maria Santos", score_percent: 84 }] }));
  render(<ClassmateMatches submission={submission} />);
  const inspect = await screen.findByRole("button", { name: "Inspect match with Maria Santos" });
  inspect.focus(); fireEvent.click(inspect);
  const dialog = screen.getByRole("dialog", { name: "Peer Similarity Review" });
  await within(dialog).findByText("Juan Dela Cruz");
  expect(within(dialog).getByText("Maria Santos")).toBeInTheDocument();
  expect(within(dialog).getByText("Similarity: 84%")).toBeInTheDocument();
  expect(dialog.querySelectorAll("mark")).toHaveLength(2);
  for (const mark of dialog.querySelectorAll("mark")) expect(mark.textContent).toBe("Students learn by sharing ideas");
  expect(within(dialog).getByRole("region", { name: "Student A answer" })).toHaveTextContent("A unique conclusion.");
  expect(within(dialog).getByRole("region", { name: "Student B answer" })).toHaveTextContent("Another ending.");
  expect(checkPeerSimilarityViaBackend).toHaveBeenLastCalledWith({ submissionId: "a", classroomId: "class", assignmentId: "assignment", matchedSubmissionId: "b" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(inspect).toHaveFocus();
});

test.each([{ snippets: [] }, { snippets: ["not present in both answers"] }])("missing evidence leaves complete answers unhighlighted", async ({ snippets }) => {
  checkPeerSimilarityViaBackend.mockResolvedValue({ ...pair, matching_snippets: snippets });
  const { container } = render(<PeerComparison submission={submission} matchedSubmissionId="b" />);
  await screen.findByText("Juan Dela Cruz");
  expect(container.querySelector("mark")).toBeNull();
  expect(screen.getByText(pair.left.text)).toBeInTheDocument();
  expect(screen.getByText(pair.right.text)).toBeInTheDocument();
  expect(screen.getByText(/without highlights/)).toBeInTheDocument();
});

test("closing inspection preserves match pagination and each pair is fetched independently", async () => {
  checkPeerSimilarityViaBackend.mockImplementation(args => Promise.resolve(args.matchedSubmissionId
    ? { ...pair, right: { ...pair.right, submission_id: args.matchedSubmissionId, student_name: `Student ${args.matchedSubmissionId}` } }
    : { total_peers_compared: 12, all_matches: Array.from({ length: 12 }, (_, i) => ({ submission_id: String(i), student_name: `Student ${i}`, score_percent: 84 })) }));
  render(<ClassmateMatches submission={submission} />);
  await screen.findByText("Page 1 of 2");
  fireEvent.click(screen.getByText("Next"));
  for (const id of ["10", "11"]) {
    fireEvent.click(screen.getByRole("button", { name: `Inspect match with Student ${id}` }));
    await within(screen.getByRole("dialog")).findByText(`Student ${id}`);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  }
});

test("a late response cannot replace the newly selected pair", async () => {
  let complete;
  checkPeerSimilarityViaBackend.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
    .mockResolvedValueOnce({ ...pair, right: { ...pair.right, student_name: "Carlo Reyes" } });
  const { rerender } = render(<PeerComparison submission={submission} matchedSubmissionId="b" />);
  rerender(<PeerComparison submission={submission} matchedSubmissionId="c" />);
  await screen.findByText("Carlo Reyes");
  await act(async () => complete(pair));
  expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument();
});

test("phrase boundaries preserve text, include punctuation, and reject unrelated words", () => {
  const text = "Before. These are four words, and these are four words. After.";
  expect(phraseRanges(text, "these are four words").map(([start, end]) => text.slice(start, end)))
    .toEqual(["These are four words", "these are four words"]);
  expect(phraseRanges("These are extra four words", "these are four words")).toEqual([]);
  expect(phraseRanges("These are 異 four words", "these are four words")).toEqual([]);
});
