import { filterTodoAssignments } from "./todoFilters";

test("search combines with status and deadline filters without changing assignments", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const assignments = [
    { id: "a", title: "Essay", classroomSubject: "English", dueDate: "2026-10-03T12:00:00Z" },
    { id: "b", title: "Reading", classroomSection: "Section B", submitted: true },
    { id: "c", title: "Revision", revisionRequest: { id: "r" }, dueDate: "2026-10-06T12:00:00Z" },
  ];
  const ids = (search, status, deadline) => filterTodoAssignments(assignments, search, status, deadline, now).map(a => a.id);
  expect(ids(" ENGLISH ", "pending", "overdue")).toEqual(["a"]);
  expect(ids("section b", "submitted", "undated")).toEqual(["b"]);
  expect(ids("", "revision", "soon")).toEqual(["c"]);
  expect(ids("English", "submitted", "all")).toEqual([]);
  expect(ids("", "all", "all")).toHaveLength(3);
});
