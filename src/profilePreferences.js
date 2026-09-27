// Only these presentation/preferences fields may be merged into a profile.
// Role, ID, account status, email and name always come from the account RPC.
const fields = ["academicTitle", "institution", "department", "bio", "avatarColor", "avatarUrl",
  "plagiarismSensitivity", "peerCrossCheck", "notifyOnSubmissions", "weeklyDigest"];

export function profilePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(fields.filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => [key, value[key]]));
}
