import { act, fireEvent, render, screen } from "@testing-library/react";
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


test("drawer locks scrolling, contains focus, and dismisses by overlay and close", () => {
  render(<ResponsiveNavigation label="Menu" current="Classes" profile={{full_name:"Alex",role:"student"}}><nav><button>Classes</button></nav></ResponsiveNavigation>);
  const trigger = screen.getByRole("button", {name:"Menu Classes"});
  fireEvent.click(trigger);
  const close = screen.getByRole("button", {name:"Close menu"});
  expect(close).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByText("Alex")).toBeInTheDocument();
  const theme = screen.getByRole("button", {name:/Switch workspace/});
  fireEvent.keyDown(close, {key:"Tab",shiftKey:true});
  expect(theme).toHaveFocus();
  fireEvent.keyDown(theme, {key:"Tab"});
  expect(close).toHaveFocus();
  fireEvent.click(close);
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("dialog").parentElement);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("desktop resize closes the drawer and restores scrolling", () => {
  const previous = window.matchMedia;
  let changed;
  const media = {matches:false, addEventListener:(_, fn)=>{changed=fn;}, removeEventListener:jest.fn()};
  window.matchMedia = () => media;
  render(<ResponsiveNavigation label="Menu" current="Classes"><nav><button>Classes</button></nav></ResponsiveNavigation>);
  fireEvent.click(screen.getByRole("button", {name:"Menu Classes"}));
  media.matches=true;
  act(()=>changed());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  window.matchMedia=previous;
});
