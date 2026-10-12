/** @jest-environment node */
import { gradeExportRows, buildGradeWorkbook, loadGradeExport } from "./gradeExport";
import ExcelJS from "exceljs";

const assignment = { id: "a", classroomId: "c", title: "Essay", classroomName: "English", dueDate: "2026-09-01T10:00:00Z" };
const members = [{ classroomId: "c", studentId: "s", studentName: "Alex" }, { classroomId: "c", studentId: "missing", studentName: "Sam" }];

function exportClient() {
  const records = [{ id: "a1", classroom_id: "A", title: "Assignment 1" },
    { id: "a2", classroom_id: "A", title: "Assignment 2" }, { id: "b", classroom_id: "B", title: "Other" }];
  return {
    from: jest.fn(() => ({ select: () => ({ eq: async (key, value) => ({ data: records.filter(row => row[key] === value) }) }) })),
    // Include a foreign row to verify the client ID guard in addition to RPC scoping.
    rpc: jest.fn(async () => ({ data: records.map(row => ({ assignmentId: row.id, assignment: row.title,
      subject: "CSST 106", student: "Juan Dela Cruz", score: "90" })) })),
  };
}

test.each(["a1", "a2"])("assignment %s supplies classroom and exports only its own rows", async assignmentId => {
  const client = exportClient();
  const result = await loadGradeExport(client, { assignmentId });
  expect(result.classroomId).toBe("A");
  expect(client.rpc).toHaveBeenCalledWith("export_classroom_grades", { requested_classroom_id: "A" });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ assignmentId, score: 90 });
});

test("classroom export retains all its assignments and excludes another classroom", async () => {
  const result = await loadGradeExport(exportClient(), { classroomId: "A" });
  expect(result.rows.map(row => row.assignmentId)).toEqual(["a1", "a2"]);
});

test("missing context warns; mismatched and unavailable assignments never export", async () => {
  const client = exportClient();
  await expect(loadGradeExport(client)).rejects.toThrow("Open a classroom or select one classroom before exporting grades.");
  await expect(loadGradeExport(client, { assignmentId: "a1", classroomId: "B" })).rejects.toThrow("does not belong");
  await expect(loadGradeExport(client, { assignmentId: "deleted" })).rejects.toThrow("unavailable");
  expect(client.rpc).not.toHaveBeenCalled();
});

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
  expect(sheet.getRow(1).values.slice(1, 5)).toEqual(["Subject", "Assignment", "Student Name", "Grade"]);
  expect(sheet.getCell("D2").value).toBe(85.5);
  expect(sheet.getCell("D3").value).toBeNull();
  expect(sheet.columnCount).toBe(4);
  expect(restored.worksheets).toHaveLength(1);
});

test("groups assignments and sorts structured and fallback names, preserving zero", async () => {
  const workbook = await buildGradeWorkbook([
    {assignmentId:"a",student:"Juan Dela Cruz",score:null},
    {assignmentId:"b",student:"Zoe Santos",score:90},
    {assignmentId:"a",student:"Maria Aquino",score:0},
    {assignmentId:"a",student:"Pedro Cruz",score:80},
    {assignmentId:"a",student:"Display name",last_name:"Aquino",first_name:"Ana",score:95},
  ]);
  const sheet = workbook.getWorksheet("Grades");
  expect(sheet.getColumn(3).values.slice(2)).toEqual(["Aquino, Ana", "Aquino, Maria", "Cruz, Pedro", "Dela Cruz, Juan", "Santos, Zoe"]);
  expect(sheet.getCell("D3").value).toBe(0);
  expect(sheet.getCell("D5").value).toBeNull();
});
