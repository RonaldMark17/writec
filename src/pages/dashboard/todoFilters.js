import { getAssignmentDueInfo } from "./shared";

export function filterTodoAssignments(assignments, search, status, deadline, now = new Date()) {
  const query = search.trim().toLowerCase();
  return assignments.filter(a => {
    if (query && ![a.title, a.classroomName, a.classroomSubject, a.classroomSection].some(value => String(value || "").toLowerCase().includes(query))) return false;
    if (status === "pending" && a.submitted) return false;
    if (status === "submitted" && !a.submitted) return false;
    if (status === "revision" && !a.revisionRequest) return false;
    const due = getAssignmentDueInfo(a.dueDate, false, now);
    if (deadline === "overdue" && (!due.isOverdue || a.submitted)) return false;
    if (deadline === "soon" && (!due.isDueSoon || a.submitted)) return false;
    if (deadline === "undated" && a.dueDate) return false;
    return true;
  });
}
