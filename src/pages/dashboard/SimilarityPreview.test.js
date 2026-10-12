import { render, screen, fireEvent } from "@testing-library/react";
import SimilarityPreview from "./SimilarityPreview";

test("stored badges display strongest scoped match and open the existing review", () => {
  const submission = { id: "s", studentId: "student", classroomId: "c", assignmentId: "a",
    scanResult: { score: 24, peerSimilarity: { all_matches: [
      { submission_id: "p1", score_percent: 22 }, { submission_id: "p2", score_percent: 41 },
      { submission_id: "foreign", score_percent: 100 },
    ] } } };
  const peers = ["p1", "p2", "foreign"].map(id => ({ id, studentId: id, assignmentId: "a", classroomId: id === "foreign" ? "other" : "c" }));
  const onReview = jest.fn();
  render(<SimilarityPreview submission={submission} submissions={peers} onReview={onReview} />);
  fireEvent.click(screen.getByRole("button", { name: "Online: 24%" }));
  fireEvent.click(screen.getByRole("button", { name: "Peer: 41% (2 matches)" }));
  expect(onReview).toHaveBeenCalledTimes(2);
  expect(onReview).toHaveBeenLastCalledWith(submission);
});
