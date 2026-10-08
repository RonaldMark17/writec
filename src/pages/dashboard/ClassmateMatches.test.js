import { act, fireEvent, render, screen } from "@testing-library/react";
import ClassmateMatches from "./ClassmateMatches";
import { checkPeerSimilarityViaBackend } from "./plagiarismScan";
jest.mock("./plagiarismScan", () => ({ checkPeerSimilarityViaBackend: jest.fn() }));
const submission = { id: "s", assignmentId: "a", classroomId: "A" };
beforeEach(() => jest.resetAllMocks());

test("shows exact calculated scores and paginates all matching classmates", async () => {
  checkPeerSimilarityViaBackend.mockResolvedValue({ total_peers_compared: 12,
    all_matches: Array.from({ length: 12 }, (_, i) => ({ submission_id: `s${i}`, student_name: `Student ${i}`, score_percent: 82.3 })) });
  render(<ClassmateMatches submission={submission} />);
  expect(await screen.findByText("Matched Student: Student 0")).toBeInTheDocument();
  expect(screen.getAllByText("Similarity: 82.3%")).toHaveLength(10);
  expect(screen.queryByText("Matched Student: Student 11")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Next"));
  expect(screen.getByText("Matched Student: Student 11")).toBeInTheDocument();
  expect(checkPeerSimilarityViaBackend).toHaveBeenCalledWith({ submissionId: "s", assignmentId: "a", classroomId: "A" });
});

test("a late response cannot expose matches from the previous classroom", async () => {
  let finish;
  checkPeerSimilarityViaBackend.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ total_peers_compared: 0, all_matches: [] });
  const { rerender } = render(<ClassmateMatches submission={submission} />);
  rerender(<ClassmateMatches submission={{ id: "t", assignmentId: "b", classroomId: "B" }} />);
  await screen.findByText(/No classmate matches/);
  await act(async () => finish({ total_peers_compared: 1, all_matches: [{ submission_id: "old", student_name: "Old student", score_percent: 95 }] }));
  expect(screen.queryByText(/Old student/)).not.toBeInTheDocument();
});

test("failed checks show an error rather than a fabricated zero similarity", async () => {
  checkPeerSimilarityViaBackend.mockRejectedValueOnce(new Error("Access denied"))
    .mockResolvedValueOnce({ enabled: false, all_matches: [] });
  render(<ClassmateMatches submission={submission} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Retry matches"));
  expect(await screen.findByText(/comparison is disabled/)).toBeInTheDocument();
});
