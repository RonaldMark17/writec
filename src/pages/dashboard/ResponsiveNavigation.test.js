import { fireEvent, render, screen } from "@testing-library/react";
import ResponsiveNavigation from "./ResponsiveNavigation";

test("compact navigation preserves destination actions and supports Escape", () => {
  const navigate = jest.fn();
  render(<ResponsiveNavigation label="Menu" current="Classes"><nav aria-label="Student navigation">
    <button onClick={() => navigate("submissions")}>Submissions</button>
    <button onClick={() => navigate("calendar")}>Calendar</button>
  </nav></ResponsiveNavigation>);
  const trigger = screen.getByRole("button", { name: "Menu Classes" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
  expect(navigate).toHaveBeenCalledWith("calendar");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  screen.getByRole("button", { name: "Submissions" }).focus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("a prevented navigation keeps the menu open", () => {
  render(<ResponsiveNavigation label="Admin menu" current="Users"><a href="/admin/approvals" onClick={event => event.preventDefault()}>Approvals</a></ResponsiveNavigation>);
  const trigger = screen.getByRole("button", { name: "Admin menu Users" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("link", { name: "Approvals" }));
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});
