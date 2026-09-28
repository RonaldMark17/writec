/** @jest-environment node */
import { gradeExportRows, buildGradeWorkbook } from "./gradeExport";
import ExcelJS from "exceljs";

const assignment = { id: "a", classroomId: "c", title: "Essay", classroomName: "English", dueDate: "2026-09-01T10:00:00Z" };
const members = [{ classroomId: "c", studentId: "s", studentName: "Alex" }, { classroomId: "c", studentId: "missing", studentName: "Sam" }];

test("isolates classes, selects latest attempt, preserves zero and missing grades", () => {
  const submissions = [
    { assignmentId: "a", classroomId: "c", studentId: "s", grade: 90, createdAt: "2026-09-01T09:00:00Z" },
    { assignmentId: "a", classroomId: "c", studentId: "s", grade: 0, createdAt: "2026-09-02T09:00:00Z" },
    { assignmentId: "a", classroomId: "other", studentId: "outsider", grade: 100 },
  ];
  const rows = gradeExportRows([assignment], submissions, members);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ score: 0, status: "Graded", timing: "Late" });
  expect(rows[1]).toMatchObject({ score: null, status: "Not submitted" });
});

test("xlsx round trip retains numeric grades, dates, and literal user text", async () => {
  const rows = gradeExportRows([assignment], [{ assignmentId: "a", classroomId: "c", studentId: "s", grade: "85.5", createdAt: "2026-09-01T09:00:00Z", feedback: '=HYPERLINK("test")' }], members);
  const workbook = await buildGradeWorkbook(rows, "Teacher", "English");
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.getWorksheet("Grades");
  expect(sheet.getCell("I2").value).toBe(85.5);
  expect(sheet.getCell("I3").value).toBeNull();
  expect(sheet.getCell("H2").value.toISOString()).toBe("2026-09-01T09:00:00.000Z");
  expect(sheet.getCell("M2").value).toBe('=HYPERLINK("test")');
  expect(sheet.getCell("M2").formula).toBeUndefined();
  expect(restored.getWorksheet("Export details")).toBeDefined();
});
