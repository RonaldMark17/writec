import { adminCsv } from "./adminCsv";

test("exports only selected fields and escapes spreadsheet formulas and quotes", () => {
  const csv = adminCsv("users", [{ full_name: '=HYPERLINK("example")', email: 'a,b@example.test', role: 'student', secret: 'never-export' }]);
  expect(csv).toContain('"\'=HYPERLINK(""example"")"');
  expect(csv).toContain('"a,b@example.test"');
  expect(csv).not.toContain('never-export');
  expect(csv).toContain('\r\n');
});
