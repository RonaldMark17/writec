import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Transcribe from "./Transcribe";
import { extractTextFromImage } from "./dashboard/ocrService";

jest.mock("./dashboard/ocrService", () => ({ extractTextFromImage: jest.fn() }));

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
  jest.clearAllMocks();
});

test("selected image is transcribed and displayed through the local model route", async () => {
  extractTextFromImage.mockImplementation(async (file, options) => {
    const result = { text: "My handwritten essay", lines: ["My handwritten essay"], processedLineCount: 1, detectedLineCount: 1 };
    options.onProgress(result);
    return result;
  });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Transcribe /></MemoryRouter>);
  const file = new File(["image"], "essay.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Handwritten image"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Transcribe handwriting" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Transcription complete: 1 lines."));
  expect(screen.getByLabelText("Transcribed text")).toHaveValue("My handwritten essay");
  expect(extractTextFromImage).toHaveBeenCalledWith(file, expect.objectContaining({ local: true }));
});

test("failed transcription leaves a visible error and permits another attempt", async () => {
  extractTextFromImage.mockRejectedValue(new Error("OCR server is offline"));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Transcribe /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Handwritten image"), { target: { files: [new File(["image"], "essay.jpg")] } });
  fireEvent.click(screen.getByRole("button", { name: "Transcribe handwriting" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("OCR server is offline");
  expect(screen.getByRole("button", { name: "Transcribe handwriting" })).toBeEnabled();
});
