const names = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const particles = new Set(["de", "del", "dela", "la", "las", "los", "da", "das", "do", "dos", "di", "du", "van", "von", "san", "santa"]);

export function studentLastName(student) {
  const explicit = student.lastName || student.last_name || student.surname || student.family_name;
  if (explicit?.trim()) return explicit.trim();
  const full = String(student.name || student.full_name || student.studentName || student.student || "").trim();
  // Support both "Surname, Given names" and the stored "Given names Surname" format.
  if (full.includes(",")) {
    const [first, rest] = full.split(",");
    if (!/^\s*(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i.test(rest)) return first.trim();
  }
  const words = full.replace(/,?\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "").trim().split(/\s+/);
  let start = words.length - 1;
  while (start > 0 && particles.has(words[start - 1].toLowerCase())) start--;
  return words.slice(start).join(" ");
}

export function compareStudentsByLastName(a, b) {
  return names.compare(studentLastName(a), studentLastName(b))
    || names.compare(studentFirstName(a), studentFirstName(b));
}

export function studentFirstName(student) {
  const explicit = student.firstName || student.first_name;
  if (explicit?.trim()) return explicit.trim();
  const full = String(student.name || student.full_name || student.studentName || student.student || "").trim();
  if (full.includes(",") && !/^\s*(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i.test(full.split(",")[1])) return full.split(",").slice(1).join(",").trim();
  const clean = full.replace(/,?\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "").trim();
  const last = studentLastName(student);
  return clean.endsWith(last) ? clean.slice(0, -last.length).trim() : clean;
}

export function studentGradeName(student) {
  return [studentLastName(student), studentFirstName(student)].filter(Boolean).join(", ");
}
