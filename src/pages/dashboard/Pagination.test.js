import { fireEvent, render, screen } from "@testing-library/react";
import { PaginatedList } from "./Pagination";

const items = (prefix, count = 23) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
function List({ classroom = "A", filter = "all", records = items(classroom) }) {
  return <PaginatedList items={records} resetKey={[classroom, filter]} label="Assignments">{rows =>
    <ul>{rows.map(row => <li key={row}>{row}</li>)}</ul>}
  </PaginatedList>;
}

test("pages filtered records and resets immediately when classroom or filter changes", () => {
  const { rerender } = render(<List />);
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  expect(screen.queryByText("A-11")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Next"));
  expect(screen.getByText("A-11")).toBeInTheDocument();
  expect(screen.queryByText("A-1")).not.toBeInTheDocument();
  rerender(<List classroom="B" />);
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  expect(screen.getByText("B-1")).toBeInTheDocument();
  expect(screen.queryByText("A-11")).not.toBeInTheDocument();
  rerender(<List classroom="A" />);
  expect(screen.getByText("A-1")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Next"));
  rerender(<List filter="graded" />);
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
});

test("hides controls for small lists and clamps the page after records disappear", () => {
  const { rerender } = render(<List />);
  fireEvent.click(screen.getByText("Next")); fireEvent.click(screen.getByText("Next"));
  expect(screen.getByText("Next")).toBeDisabled();
  rerender(<List records={items("A", 12)} />);
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  rerender(<List records={items("A", 2)} />);
  expect(screen.getByText("A-1")).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
