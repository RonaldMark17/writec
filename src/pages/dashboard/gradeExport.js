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
        studentId, classroom: assignment.classroomName, section: assignment.classroomSection,
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
    ["Student account ID", "studentId", 38], ["Class", "classroom", 24],
    ["Section", "section", 18], ["Submitted date (UTC)", "submitted", 24],
    ["Due date (UTC)", "due", 24], ["Status", "status", 20],
    ["Submission timing", "timing", 20], ["Returned date (UTC)", "returned", 24],
    ["Teacher feedback", "feedback", 50],
  ];
  sheet.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  const dateValue = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
  rows.forEach((row) => sheet.addRow({ ...row, due: dateValue(row.due), submitted: dateValue(row.submitted), returned: dateValue(row.returned) }));
  ["due", "submitted", "returned"].forEach((key) => { sheet.getColumn(key).numFmt = "yyyy-mm-dd hh:mm"; });
  sheet.autoFilter = { from: "A1", to: "M1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF137333" } };
  sheet.getColumn("feedback").alignment = { wrapText: true, vertical: "top" };
  const notes = workbook.addWorksheet("Export details");
  notes.columns = [{ width: 24 }, { width: 100 }];
  notes.addRows([
    ["Teacher", teacher], ["Exported at (UTC)", new Date().toISOString()], ["Scope", scope],
    ["Rows", rows.length], ["Submission selection", "Latest submission per student and assignment. Includes enrolled students with no submission."],
    ["Scores", "Saved scores are preserved as recorded. Blank means ungraded or not submitted; no percentage or maximum score is assumed."],
    ["Data source", "Classroom records queried from the database at export time."],
  ]);
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
