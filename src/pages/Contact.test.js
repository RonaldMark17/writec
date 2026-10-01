import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Contact from "./Contact";
jest.mock("../apiFetch", () => ({ getBackendUrl: () => "http://backend.test" }));
beforeEach(() => { global.fetch = jest.fn(); });
function fill() {
  for (const [label,value] of [['Name','Alex'],['Email','alex@example.com'],['Subject','Help'],['Message','Please help']])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
test("sends form fields to backend and disables duplicate submission until delivery completes", async () => {
  let finish;
  fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Contact /></MemoryRouter>); fill();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button").closest("form"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: 'Alex', email: 'alex@example.com', subject: 'Help', message: 'Please help' });
  await act(async () => finish({ ok: true, json: async () => ({}) }));
  expect(screen.getByRole("status")).toHaveTextContent("sent successfully");
});
test("empty and invalid input does not send; backend failure is displayed", async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Contact /></MemoryRouter>);
  fireEvent.submit(screen.getByRole("button").closest("form"));
  expect(fetch).not.toHaveBeenCalled();
  fill(); fetch.mockResolvedValue({ ok: false, json: async () => ({ detail: 'Contact email is not configured yet.' }) });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByRole("alert")).toHaveTextContent('not configured');
});
