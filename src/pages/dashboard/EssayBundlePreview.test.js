import { render, screen } from "@testing-library/react";
import SubmissionFilePreview from "./SubmissionFilePreview";
import { apiFetch } from "../../apiFetch";

jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn(), getBackendUrl: () => "http://localhost:8000" }));
jest.mock("./shared", () => ({ downloadSubmissionFileBlob: jest.fn() }));

test("saved essay displays numbered original pages and the exact complete transcript", async () => {
  URL.createObjectURL = jest.fn(() => "blob:page"); URL.revokeObjectURL = jest.fn();
  apiFetch.mockImplementation(async url => url.includes("page_number=")
    ? { ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) }
    : { ok: true, json: async () => ({ text: "First\nContinuation\nConclusion", pages: [
      { page_number: 3, name: "a.png", text: "Conclusion" }, { page_number: 1, name: "z.png", text: "First" },
      { page_number: 2, name: "b.png", text: "Continuation" },
    ] }) });
  const { unmount } = render(<SubmissionFilePreview fileUrl="http://localhost:8000/uploads/submissions/student/class/work.essay.zip" />);
  const images = await screen.findAllByRole("img", { hidden: true });
  expect(images.map(image => image.alt)).toEqual(["Submitted page 1", "Submitted page 2", "Submitted page 3"]);
  expect(screen.getByText("First\nContinuation\nConclusion", { exact: true, normalizer: text => text })).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledTimes(4);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});
