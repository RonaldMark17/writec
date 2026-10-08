const names = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const particles = new Set(["de", "del", "dela", "la", "las", "los", "da", "das", "do", "dos", "di", "du", "van", "von", "san", "santa"]);

export function studentLastName(student) {
  const explicit = student.lastName || student.last_name || student.surname || student.family_name;
  if (explicit?.trim()) return explicit.trim();
  const full = String(student.name || student.full_name || "").trim();
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
    || names.compare(a.name || a.full_name || "", b.name || b.full_name || "")
    || names.compare(String(a.id || ""), String(b.id || ""));
}
