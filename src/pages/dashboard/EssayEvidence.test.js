import { fireEvent, render, screen, within } from "@testing-library/react";
import EssayEvidence from "./EssayEvidence";
import { evidenceRanges } from "./similarityEvidence";

jest.mock("./PeerSimilarityReview", () => ({ ...jest.requireActual("./PeerSimilarityReview"),
  PeerComparison: ({ matchedSubmissionId }) => <p>Comparison for {matchedSubmissionId}</p> }));

test.each(["light", "dark"])("%s: overlap remains one essay with source and peer keyboard actions", theme => {
  document.documentElement.dataset.theme = theme;
  const text = "One two three four five.\n\nConclusion.";
  const ranges = evidenceRanges(text, { transcribedText: text, matchedSources: [{ id: "online", title: "Actual source", url: "https://example.com/paper", matching_fragments: [{start:4,end:18}] }] },
    [{submission_id:"peer",student_name:"Classmate",score_percent:41,matching_snippets:["one two three four"]}]);
  const { container, rerender } = render(<EssayEvidence text={text} ranges={ranges} submission={{id:"essay"}} />);
  expect(container.querySelector("#review-transcription").textContent).toBe(text);
  expect(container.querySelector("mark mark")).toBeNull();
  const both = screen.getByRole("button", {name:/Online \+ Peer Match:/});
  both.focus(); fireEvent.keyDown(both, {key:"Enter"});
  expect(screen.getByText("Actual source")).toBeInTheDocument();
  expect(screen.getByRole("link", {name:"View Source"})).toHaveAttribute("href", "https://example.com/paper");
  expect(screen.getByText("Match: 41%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Inspect Match"}));
  expect(screen.getByText("Comparison for peer")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("dialog", {name:"Peer Similarity Review"})).getByRole("button", {name:"Close"}));
  rerender(<EssayEvidence text="Edited text" ranges={[]} submission={{id:"essay"}} />);
  expect(screen.queryByRole("complementary", {name:"Selected match details"})).not.toBeInTheDocument();
  delete document.documentElement.dataset.theme;
});
