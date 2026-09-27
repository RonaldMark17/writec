import { render, screen, waitFor } from "@testing-library/react";
import SubmissionFilePreview from "./SubmissionFilePreview";
import { downloadSubmissionFileBlob } from "./shared";

jest.mock("./shared", () => ({ downloadSubmissionFileBlob: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
});

test("shows uploaded text contents and frees the file URL", async () => {
  const file = new File(["Original essay"], "essay.txt", { type: "text/plain" });
  file.text = jest.fn().mockResolvedValue("Original essay");
  const { unmount } = render(<SubmissionFilePreview file={file} />);
  expect(await screen.findByText("Original essay")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download original" })).toHaveAttribute("download", "essay.txt");
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

test("loads a saved PDF through authenticated download and embeds it", async () => {
  downloadSubmissionFileBlob.mockResolvedValue(new Blob(["pdf"], { type: "application/octet-stream" }));
  render(<SubmissionFilePreview fileUrl="student/essay.pdf" />);
  expect(await screen.findByTitle("Uploaded PDF")).toHaveAttribute("src", "blob:preview");
  expect(downloadSubmissionFileBlob).toHaveBeenCalledWith("student/essay.pdf");
  expect(URL.createObjectURL.mock.calls[0][0].type).toBe("application/pdf");
});

test("a failed download reports an error instead of showing a broken preview", async () => {
  downloadSubmissionFileBlob.mockRejectedValue(new Error("Forbidden"));
  render(<SubmissionFilePreview fileUrl="student/essay.docx" />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"));
});
