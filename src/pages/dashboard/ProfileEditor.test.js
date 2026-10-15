import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

test("preferences show real service state without disabling email preferences", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /preferences/i }));
  expect(await screen.findByText("No credits available")).toBeInTheDocument();
  expect(screen.getByText("Models loaded")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Submission Email Notifications/i })).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: /Weekly Submission Digest/i })).toBeEnabled();
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
  expect(await screen.findAllByRole("alert")).toHaveLength(3);
  expect(screen.getByLabelText("College level / Year level")).toHaveFocus();
  expect(screen.getByText("Course / program is required.")).toBeInTheDocument();
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});

test("student profile hides AI preferences while preserving profile and security", () => {
  show({ profile: { id: "student", role: "student", full_name: "Alex" } });
  expect(screen.queryByRole("button", { name: /AI & Preferences/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Profile & Info/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Security/i })).toBeInTheDocument();
});


test("salutation precedes the name, Bio is absent, and old Bio is not sent on save", async () => {
  show({profile:{...profile,full_name:"Juan Dela Cruz",academicTitle:"Prof.",bio:"Legacy bio"}});
  expect(screen.getByRole("heading",{name:"Prof. Juan Dela Cruz"})).toBeInTheDocument();
  expect(screen.queryByLabelText(/Bio/)).not.toBeInTheDocument();
  const title=screen.getByLabelText("Salutation"), name=screen.getByLabelText("Display name");
  expect(title.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByText("Save profile"));
  await screen.findByText("Profile updated.");
  const prefs=supabase.auth.updateUser.mock.calls[0][0].data.writecheck_preferences;
  expect(prefs.academicTitle).toBe("Prof.");
  expect(prefs).not.toHaveProperty("bio");
});

const emailControl = () => screen.getByRole("checkbox", { name: /Submission Email Notifications/i });
const digestControl = () => screen.getByRole("checkbox", { name: /Weekly Submission Digest/i });

test.each([false, true])("email preferences persist independently through remote reload (immediate=%s)", async immediate => {
  const view = show({profile:{...profile,notifyOnSubmissions:!immediate,weeklyDigest:immediate}});
  fireEvent.click(screen.getByRole("button", {name:/preferences/i}));
  await screen.findByText("No credits available");
  userEvent.click(screen.getByText("Receive notifications when students turn in work"));
  userEvent.click(screen.getByText("Weekly Submission Digest"));
  expect(emailControl().checked).toBe(immediate);
  expect(digestControl().checked).toBe(!immediate);
  fireEvent.click(screen.getByText("Save profile"));
  await screen.findByText("Profile updated.");
  const remote = supabase.auth.updateUser.mock.calls[0][0].data.writecheck_preferences;
  expect(remote).toMatchObject({notifyOnSubmissions:immediate,weeklyDigest:!immediate});
  view.unmount();
  localStorage.clear(); // A fresh login/device must not need the browser cache.
  show({profile:{...profile,...profilePreferences(remote)}});
  fireEvent.click(screen.getByRole("button", {name:/preferences/i}));
  await screen.findByText("No credits available");
  expect(emailControl().checked).toBe(immediate);
  expect(digestControl().checked).toBe(!immediate);
});

test("loading or failed service status does not block row, control, or keyboard interaction", async () => {
  let rejectStatus;
  apiFetch.mockImplementation(() => new Promise((_resolve, reject) => { rejectStatus = reject; }));
  show();
  fireEvent.click(screen.getByRole("button", {name:/preferences/i}));
  expect(emailControl()).toBeEnabled();
  userEvent.click(emailControl());
  expect(emailControl()).toBeChecked();
  emailControl().focus();
  userEvent.keyboard(" ");
  expect(emailControl()).not.toBeChecked();
  expect(digestControl()).not.toBeChecked();
  await act(async () => rejectStatus(new Error("Offline")));
  await screen.findAllByText("Service status unavailable.");
  userEvent.click(digestControl().closest("label"));
  expect(digestControl()).toBeChecked();
});

test("saving disables notification controls and failed save keeps drafts without publishing them", async () => {
  let finish;
  supabase.auth.updateUser.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const saved = jest.fn();
  show({onSaved:saved});
  fireEvent.click(screen.getByRole("button", {name:/preferences/i}));
  await screen.findByText("No credits available");
  userEvent.click(emailControl());
  fireEvent.click(screen.getByText("Save profile"));
  await screen.findByRole("button", {name:/Saving/});
  expect(emailControl()).toBeDisabled();
  expect(digestControl()).toBeDisabled();
  await act(async () => finish({error:{message:"Network unavailable"}}));
  expect(await screen.findByRole("alert")).toHaveTextContent("preferences were not saved");
  expect(emailControl()).toBeChecked();
  expect(emailControl()).toBeEnabled();
  expect(localStorage.getItem("writecheck_profile_prefs_teacher")).toBeNull();
  expect(saved).not.toHaveBeenCalled();
});

test("notification preference layout fixture", async () => {
  show();
  fireEvent.click(screen.getByRole("button", {name:/preferences/i}));
  await screen.findByText("No credits available");
  if (process.env.WC_CAPTURE_DIR) {
    const fs = require("fs"), path = require("path");
    fs.mkdirSync(process.env.WC_CAPTURE_DIR, {recursive:true});
    fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR,"notification-preferences.body.html"), document.body.innerHTML);
  }
});
