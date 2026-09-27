import { fireEvent, render, screen } from "@testing-library/react";
import SubmissionStation from "./SubmissionStation";

jest.mock("./SubmissionFilePreview", () => ({ fileUrl }) => <div>Original file: {fileUrl}</div>);
jest.mock("../../supabaseClient", () => ({ supabase: {} }));

test("processing submission displays original file and switches to automatic result", () => {
  const onReview = jest.fn();
  const submission = { id: "one", studentName: "Alex", essayTitle: "Essay", fileUrl: "essay.pdf", processingState: "processing" };
  const { rerender } = render(<SubmissionStation submission={submission} onReview={onReview} />);
  expect(screen.getByText("Original file: essay.pdf")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Processing");
  expect(screen.queryByRole("button", { name: /scan for plagiarism/i })).not.toBeInTheDocument();
  const completed = { ...submission, processingState: "ready", transcribedText: "Recognized essay", scanResult: { score: 38, summary: "Copyleaks internet check and classroom comparison." } };
  rerender(<SubmissionStation submission={completed} onReview={onReview} />);
  expect(screen.getByText("Plagiarism result: 38% similarity")).toBeInTheDocument();
  expect(screen.getByText("Recognized essay")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View full report & grade" }));
  expect(onReview).toHaveBeenCalledWith(completed);
});

test("failed checks do not display an old report as the new result", () => {
  render(<SubmissionStation submission={{ fileUrl: "essay.txt", processingState: "failed", processingError: "Configure public webhook", scanResult: { score: 0 } }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Configure public webhook");
  expect(screen.queryByText(/0% similarity/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review failure and retry" })).toBeInTheDocument();
});

test("saved image and text remain visible while the API check is pending or failed", () => {
  const submission = { fileUrl: "essay.jpg", transcribedText: "Student reviewed text", processingState: "processing" };
  const { rerender } = render(<SubmissionStation submission={submission} />);
  expect(screen.getByText("Original file: essay.jpg")).toBeInTheDocument();
  expect(screen.getByText("Student reviewed text")).toBeVisible();
  expect(screen.queryByText(/% similarity/)).not.toBeInTheDocument();
  rerender(<SubmissionStation submission={{ ...submission, processingState: "failed", processingError: "API unavailable" }} />);
  expect(screen.getByText("Student reviewed text")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("API unavailable");
});

test("completed provider results identify the API scan and display its source links", () => {
  render(<SubmissionStation submission={{ processingState: "ready", fileUrl: "essay.jpg", scanResult: {
    score: 27, provider: "copyleaks", scanId: "j-test", matchedSources: [{ title: "Matched publication", url: "https://example.com/article" }],
  } }} />);
  expect(screen.getByText(/Copyleaks API result/)).toHaveTextContent("j-test");
  expect(screen.getByRole("link", { name: "Matched publication" })).toHaveAttribute("href", "https://example.com/article");
});
