export function profileName(profile = {}) {
  const name = (profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "User").trim();
  const raw = typeof (profile.academicTitle ?? profile.salutation) === "string" ? (profile.academicTitle ?? profile.salutation).trim() : "";
  const title = ({Professor:"Prof.", Doctor:"Dr."})[raw] || raw;
  if (!title || name.toLowerCase().startsWith(title.toLowerCase() + " ") || (raw && name.toLowerCase().startsWith(raw.toLowerCase() + " "))) return name;
  return `${title} ${name}`;
}
export function profileRole(profile = {}) {
  return ({student:"Student",teacher:"Teacher",admin:"Administrator"})[profile.role] || "Account";
}
