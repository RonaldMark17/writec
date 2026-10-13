import { act, fireEvent, render, screen } from "@testing-library/react";
import ValidatedForm, { ValidatedInput, ValidatedTextarea } from "./ValidatedForm";

test("required fields reject whitespace, focus and describe errors, and clear while correcting", () => {
  const submit = jest.fn();
  render(<ValidatedForm onSubmit={submit}>
    <label>Classroom name<ValidatedInput required defaultValue="   " /></label>
    <label>Subject<ValidatedInput required defaultValue="Computer Science" /></label>
    <label>Instructions<ValidatedTextarea /></label>
    <button>Create</button>
  </ValidatedForm>);
  const name = screen.getByLabelText("Classroom name");
  fireEvent.click(screen.getByText("Create"));
  expect(submit).not.toHaveBeenCalled();
  expect(name).toHaveFocus();
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription("Classroom name is required.");
  expect(screen.getByRole("alert")).toHaveTextContent("Classroom name is required.");
  expect(screen.getByLabelText("Subject")).toHaveValue("Computer Science");
  fireEvent.change(name, { target: { value: "CSST  106" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(name).toHaveValue("CSST  106");
  fireEvent.click(screen.getByText("Create"));
  expect(submit).toHaveBeenCalledTimes(1);
});

test("a pending submission cannot be sent twice", async () => {
  let finish;
  const submit = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  render(<ValidatedForm onSubmit={submit}><ValidatedInput required defaultValue="Valid" /><button>Save</button></ValidatedForm>);
  fireEvent.click(screen.getByText("Save"));
  fireEvent.click(screen.getByText("Save"));
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
