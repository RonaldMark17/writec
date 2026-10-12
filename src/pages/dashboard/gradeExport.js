import { compareStudentsByLastName, studentGradeName } from "./rosterSort";
export async function loadGradeExport(client, { classroomId, assignmentId } = {}) {
  if (!classroomId && !assignmentId) {
    throw new Error("Open a classroom or select one classroom before exporting grades.");
  }
  let assignment;
  if (assignmentId) {
    const { data, error } = await client.from("assignmentTable").select("id, classroom_id, title").eq("id", assignmentId);
    if (error) throw error;
    assignment = (data || []).find(row => String(row.id) === String(assignmentId));
    if (!assignment?.classroom_id) throw new Error("The selected assignment is unavailable. Refresh and try again.");
    if (classroomId && String(classroomId) !== String(assignment.classroom_id)) {
      throw new Error("The selected assignment does not belong to this classroom.");
    }
    classroomId = assignment.classroom_id;
  }
  // Check row IDs too; the existing RPC enforces teacher access and classroom scope.
  const { data: assignments, error: assignmentError } = await client.from("assignmentTable")
    .select("id, classroom_id").eq("classroom_id", classroomId);
  if (assignmentError) throw assignmentError;
  const allowed = new Set((assignments || []).filter(row => String(row.classroom_id) === String(classroomId))
    .map(row => String(row.id)));
  if (assignmentId && !allowed.has(String(assignmentId))) throw new Error("The assignment classroom changed. Refresh and try again.");
  const { data, error } = await client.rpc("export_classroom_grades", { requested_classroom_id: String(classroomId) });
  if (error) throw error;
  const rows = (data || []).filter(row => allowed.has(String(row.assignmentId))
    && (!assignmentId || String(row.assignmentId) === String(assignmentId)))
    .map(row => ({ ...row, score: row.score == null || String(row.score).trim() === "" ? null
      : Number.isFinite(Number(row.score)) ? Number(row.score) : row.score }));
  return { rows, classroomId, assignmentTitle: assignment?.title };
}

export function gradeExportRows(assignments, submissions, members) {
  const rows = [];
  for (const assignment of assignments) {
    const roster = new Map(members.filter((m) => m.classroomId === assignment.classroomId)
      .map((m) => [m.studentId, m]));
    const latest = new Map();
    for (const submission of submissions) {
      if (submission.assignmentId !== assignment.id || submission.classroomId !== assignment.classroomId) continue;
      const previous = latest.get(submission.studentId);
      if (!previous || new Date(submission.createdAt || 0) > new Date(previous.createdAt || 0)) latest.set(submission.studentId, submission);
      if (!roster.has(submission.studentId)) roster.set(submission.studentId, submission);
    }
    for (const [studentId, member] of roster) {
      const submission = latest.get(studentId);
      const grade = submission?.grade;
      const graded = grade !== null && grade !== undefined && String(grade).trim() !== "";
      const numeric = graded && Number.isFinite(Number(grade));
      rows.push({
        student: member.studentName || submission?.studentName || "Student",
        first_name: member.first_name || member.firstName, last_name: member.last_name || member.lastName,
        assignmentId: assignment.id, studentId, classroom: assignment.classroomName, section: assignment.classroomSection,
        subject: assignment.classroomSubject, assignment: assignment.title,
        due: assignment.dueDate, submitted: submission?.createdAt,
        score: graded ? (numeric ? Number(grade) : String(grade)) : null,
        status: !submission ? "Not submitted" : graded ? "Graded" : "Awaiting grade",
        timing: !submission ? "" : !assignment.dueDate ? "No deadline" :
          new Date(submission.createdAt) > new Date(assignment.dueDate) ? "Late" : "On time",
        returned: submission?.returnedAt, feedback: submission?.feedback || "",
      });
    }
  }
  return rows;
}

export async function buildGradeWorkbook(rows, teacher, scope) {
  const ExcelJS = await import("exceljs");
  const workbook = new (ExcelJS.default || ExcelJS).Workbook();
  workbook.creator = "WriteCheck";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Grades", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = [
    ["Subject", "subject", 24], ["Assignment", "assignment", 35],
    ["Student Name", "student", 28], ["Grade", "score", 20],
  ];
  sheet.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  const groups = new Map();
  rows.forEach(row => {
    const key = row.assignmentId || `${row.subject}::${row.assignment}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  for (const group of groups.values()) {
    group.slice().sort(compareStudentsByLastName).forEach(row => sheet.addRow({
      subject: row.subject, assignment: row.assignment, student: studentGradeName(row),
      score: row.score == null || String(row.score).trim() === "" ? null : row.score,
    }));
  }
  sheet.autoFilter = { from: "A1", to: "D1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF137333" } };
  return workbook;
}

export async function downloadGrades(rows, teacher, scope) {
  const workbook = await buildGradeWorkbook(rows, teacher, scope);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `writecheck-grades-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
