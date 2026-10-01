import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfileEditor from "./ProfileEditor";
import { supabase } from "../../supabaseClient";
import { apiFetch } from "../../apiFetch";
import { profilePreferences } from "../../profilePreferences";

jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn(), auth: { updateUser: jest.fn() } } }));
jest.mock("../../apiFetch", () => ({ apiFetch: jest.fn() }));
const profile = { id: "teacher", role: "teacher", full_name: "Teacher", institution: "Saved school", peerCrossCheck: false };
const show = (props = {}) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProfileEditor profile={profile} {...props} /></MemoryRouter>);
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  supabase.rpc.mockResolvedValue({ data: [{ full_name: "Teacher" }] });
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ copyleaks: "No credits available", ocr: "Models loaded",
    notifications: { configured: false, message: "Email disabled — SMTP setup required" } }) });
});

test("remote profile wins over stale browser preferences and is saved remotely", async () => {
  localStorage.setItem("writecheck_profile_prefs_teacher", JSON.stringify({ institution: "Stale school" }));
  show();
  expect(screen.getByDisplayValue("Saved school")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Save profile"));
  await screen.findByText("Profile updated.");
  expect(supabase.auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    writecheck_preferences: expect.objectContaining({ institution: "Saved school", peerCrossCheck: false }) }) }));
});

test("failed remote preference save is never reported as success", async () => {
  const saved = jest.fn();
  supabase.auth.updateUser.mockResolvedValue({ error: { message: "Network unavailable" } });
  show({ onSaved: saved });
  fireEvent.click(screen.getByText("Save profile"));
  expect(await screen.findByRole("alert")).toHaveTextContent("preferences were not saved");
  expect(saved).not.toHaveBeenCalled();
  expect(localStorage.getItem("writecheck_profile_prefs_teacher")).toBeNull();
});

test("preferences show real service state and disable unavailable email controls", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /preferences/i }));
  expect(await screen.findByText("No credits available")).toBeInTheDocument();
  expect(screen.getByText("Models loaded")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Submission Email Notifications/i })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Weekly Submission Digest/i })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Peer-to-Peer/i })).not.toBeChecked();
});

test("user-editable preferences cannot override identity or authorization", () => {
  expect(profilePreferences({ role: "admin", account_status: "active", id: "other", institution: "School" }))
    .toEqual({ institution: "School" });
});

test("student academic details load and persist with the existing account preferences", async () => {
  show({ profile: { id: "student", role: "student", full_name: "Alex", gradeLevel: "2nd Year College", courseTrack: "BS Computer Science", institution: "Test University" } });
  expect(screen.getByLabelText("College level / Year level")).toHaveValue("2nd Year College");
  expect(screen.getByLabelText("Course / Program")).toHaveValue("BS Computer Science");
  fireEvent.change(screen.getByLabelText("University / College"), { target: { value: "New University" } });
  fireEvent.click(screen.getByText("Save profile"));
  await screen.findByText("Profile updated.");
  expect(supabase.auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    writecheck_preferences: expect.objectContaining({ gradeLevel: "2nd Year College", courseTrack: "BS Computer Science", institution: "New University" }) }) }));
  const reloaded = profilePreferences(supabase.auth.updateUser.mock.calls[0][0].data.writecheck_preferences);
  expect(reloaded).toEqual(expect.objectContaining({ gradeLevel: "2nd Year College", courseTrack: "BS Computer Science", institution: "New University" }));
});

test("student cannot save incomplete academic details", async () => {
  show({ profile: { id: "student", role: "student", full_name: "Alex" } });
  fireEvent.click(screen.getByText("Save profile"));
  expect(await screen.findByRole("alert")).toHaveTextContent("college level, course, and university");
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});

test("student profile hides AI preferences while preserving profile and security", () => {
  show({ profile: { id: "student", role: "student", full_name: "Alex" } });
  expect(screen.queryByRole("button", { name: /AI & Preferences/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Profile & Info/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Security/i })).toBeInTheDocument();
});
