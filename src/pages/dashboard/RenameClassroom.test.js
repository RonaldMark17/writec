import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RenameClassroom from "./RenameClassroom";
import { apiFetch } from "../../apiFetch";
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn(), getBackendUrl: () => "http://backend" }));
beforeEach(() => jest.resetAllMocks());
const classroom = { id: "class-1", name: "CSST 106", code: "ABC123" };
function show() {
  const onRenamed = jest.fn(), onClose = jest.fn();
  render(<RenameClassroom classroom={classroom} onRenamed={onRenamed} onClose={onClose} />);
  return { onRenamed, onClose, input: screen.getByLabelText("Classroom name") };
}
test("prefills name, rejects whitespace without a request, and clears inline errors", () => {
  const { input } = show();
  expect(input).toHaveValue(classroom.name);
  expect(screen.getByText("Save Changes")).toBeDisabled();
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.click(screen.getByText("Save Changes"));
  expect(screen.getByRole("alert")).toHaveTextContent("Classroom name is required.");
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "New name" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("only sends trimmed name to the existing record, waits for confirmation and prevents duplicates", async () => {
  let resolve;
  apiFetch.mockReturnValue(new Promise(done => { resolve = done; }));
  const { input, onRenamed, onClose } = show();
  fireEvent.change(input, { target: { value: "  CSST 106 – Pattern Recognition  " } });
  fireEvent.click(screen.getByText("Save Changes"));
  fireEvent.click(screen.getByText("Saving..."));
  expect(onRenamed).not.toHaveBeenCalled();
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledWith("http://backend/api/classrooms/class-1/name", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "CSST 106 – Pattern Recognition" }) }));
  const row = { id: classroom.id, classroom_code: classroom.code, classroom_name: "CSST 106 – Pattern Recognition" };
  resolve({ ok: true, json: async () => row });
  await waitFor(() => expect(onRenamed).toHaveBeenCalledWith(row));
  expect(onClose).toHaveBeenCalledTimes(1);
});
test("failed saves keep the form and entered name open", async () => {
  apiFetch.mockRejectedValue(new Error("Network failed"));
  const { input, onRenamed, onClose } = show();
  fireEvent.change(input, { target: { value: "New name" } });
  fireEvent.click(screen.getByText("Save Changes"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Classroom name could not be updated. Please try again.");
  expect(input).toHaveValue("New name");
  expect(onClose).not.toHaveBeenCalled();
  expect(onRenamed).not.toHaveBeenCalled();
});
