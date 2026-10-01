import { useState } from "react";
import ProfileEditor from "./ProfileEditor";

export default function StudentProfileSetup({ profile, onSaved }) {
  const [dismissed, setDismissed] = useState(false);
  const complete = [profile.gradeLevel, profile.courseTrack, profile.institution]
    .every((value) => typeof value === "string" && value.trim());
  if (profile.role !== "student" || profile.account_status !== "active" || complete || dismissed) return null;
  return <ProfileEditor profile={profile} setupMode onSaved={onSaved} onClose={() => setDismissed(true)} />;
}
