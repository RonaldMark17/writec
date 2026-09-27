import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";
import { applyTheme } from "./theme";

let systemChange;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: (event, callback) => { systemChange = callback; }, removeEventListener: jest.fn() }));
});
afterEach(cleanup);

test("uses system theme initially and saves an explicit toggle across remounts", () => {
  applyTheme();
  const view = render(<ThemeToggle />);
  expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button"));
  expect(localStorage.getItem("writecheck-theme")).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  view.unmount();
  applyTheme();
  render(<ThemeToggle />);
  expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  act(() => systemChange());
  expect(document.documentElement.dataset.theme).toBe("light");
});

test("synchronizes controls and changes from another tab", () => {
  applyTheme();
  render(<><ThemeToggle /><ThemeToggle /></>);
  fireEvent.click(screen.getAllByRole("button")[0]);
  for (const button of screen.getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
  act(() => {
    localStorage.setItem("writecheck-theme", "dark");
    window.dispatchEvent(new Event("storage"));
  });
  for (const button of screen.getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.style.colorScheme).toBe("dark");
});
