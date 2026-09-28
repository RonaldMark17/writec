const columns = {
  users: ["full_name", "email", "role", "registered_at", "account_status"],
  classes: ["classroom_name", "section", "classroom_code", "teacher_name", "students", "activities", "created_at", "status"],
  "activity-logs": ["created_at", "actor_name", "actor_role", "action", "target_name", "target_id"],
};

export function adminCsv(page, rows) {
  const fields = columns[page];
  if (!fields) throw new Error("This page cannot be exported.");
  const escape = (value) => {
    let text = String(value ?? "");
    // Prevent spreadsheet formula execution in user-provided values.
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [fields, ...rows.map((row) => fields.map((field) => row[field]))]
    .map((row) => row.map(escape).join(",")).join("\r\n");
}

export function downloadAdminCsv(page, rows, pageNumber) {
  const url = URL.createObjectURL(new Blob([adminCsv(page, rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `writecheck-${page}-page-${pageNumber}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
