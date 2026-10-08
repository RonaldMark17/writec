import { compareStudentsByLastName, studentLastName } from "./rosterSort";

test("uses explicit surnames and handles comma names, compound surnames and suffixes", () => {
  expect(studentLastName({ name: "Juan Dela Cruz" })).toBe("Dela Cruz");
  expect(studentLastName({ name: "Juan de la Cruz Jr." })).toBe("de la Cruz");
  expect(studentLastName({ name: "Dela Cruz, Juan" })).toBe("Dela Cruz");
  expect(studentLastName({ name: "Juan Santos, Jr." })).toBe("Santos");
  expect(studentLastName({ name: "Ana Maria Garcia", last_name: "Maria Garcia" })).toBe("Maria Garcia");
  expect(studentLastName({ name: "Prince" })).toBe("Prince");
});

test("sorts case-insensitively by surname before given name with stable ties", () => {
  const rows = ["Maria Santos", "Mark Reyes", "Ana Garcia", "Juan Dela Cruz", "zoe garcia", "aaron SANTOS"]
    .map(name => ({ name }));
  expect(rows.sort(compareStudentsByLastName).map(row => row.name)).toEqual([
    "Juan Dela Cruz", "Ana Garcia", "zoe garcia", "Mark Reyes", "aaron SANTOS", "Maria Santos",
  ]);
});
