import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";
import Dashboard from "./Dashboard";
import { adminRequest } from "../apiFetch";
import { supabase } from "../supabaseClient";

jest.mock("../apiFetch", () => ({ adminRequest: jest.fn() }));
jest.mock("../supabaseClient", () => ({ supabase: { rpc: jest.fn(), auth: { getUser: jest.fn() } }, signOutAndExpireToken: jest.fn() }));
jest.mock("./StudentDashboard", () => () => <div>Student workspace</div>);
jest.mock("./TeacherDashboard", () => () => <div>Teacher workspace</div>);
const profile = { id: "admin1", full_name: "Admin Name", email: "admin@example.com", role: "admin", account_status: "active" };
const user = { id: "student1", full_name: "Alex Santos", email: "alex@example.com", role: "student", account_status: "active", registered_at: null };
function show(path, element) {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>);
}
function mockAccount(data) {
  supabase.rpc.mockReturnValue({ abortSignal: jest.fn().mockResolvedValue({ data }) });
}
beforeEach(() => { jest.clearAllMocks(); supabase.auth.getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } }); });

test("dedicated approval queue requests all pending registrations and supports approval", async () => {
  adminRequest.mockResolvedValue({ items: [{ ...user, account_status: "pending" }], total: 31 });
  show("/admin/approvals", <AdminDashboard profile={profile} />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  expect(adminRequest).toHaveBeenCalledWith(expect.stringMatching(/^users\?.*status=pending/));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Account approved.")).toBeInTheDocument();
  expect(adminRequest).toHaveBeenCalledWith("users/student1/status", expect.objectContaining({ body: '{"status":"active"}' }));
});

test.each(["student", "teacher"])("admin creates an approved %s without replacing the browser session", async (role) => {
  adminRequest.mockImplementation((path, options) => Promise.resolve(options?.method === "POST" ? { id: "new", account_status: "active" } : { items: [], total: 0 }));
  show("/admin/users", <AdminDashboard profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Name" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@school.edu.ph" } });
  fireEvent.change(screen.getByLabelText("Account role"), { target: { value: role } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create and approve" }));
  expect(await screen.findByText(/Account created and approved/)).toBeInTheDocument();
  expect(adminRequest).toHaveBeenCalledWith("users", expect.objectContaining({ method: "POST", body: JSON.stringify({ full_name: "New Name", email: "new@school.edu.ph", password: "test-password", role }) }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("creation failures leave the form open and never claim success", async () => {
  adminRequest.mockImplementation((path, options) => options?.method === "POST" ? Promise.reject(new Error("This email is already registered.")) : Promise.resolve({ items: [], total: 0 }));
  show("/admin/users", <AdminDashboard profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Name" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@school.edu.ph" } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create and approve" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("already registered"));
  expect(screen.queryByText(/Account created and approved/)).not.toBeInTheDocument();
});

test("admin header toggles and persists the workspace theme", () => {
  document.documentElement.dataset.theme = "light";
  show("/admin/profile", <AdminDashboard profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "Switch workspace to dark mode" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("writecheck-theme")).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch workspace to light mode" }));
  expect(document.documentElement.dataset.theme).toBe("light");
});

test("user filters reach the server and status changes require confirmation", async () => {
  adminRequest.mockResolvedValue({ items: [user], total: 1 });
  show("/admin/users", <AdminDashboard profile={profile} />);
  await screen.findByText("Alex Santos");
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "student" } });
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(expect.stringContaining("role=student")));
  await screen.findByText("Alex Santos");
  fireEvent.click(screen.getByText("Disable"));
  expect(screen.getByRole("dialog")).toHaveTextContent("Are you sure");
  expect(adminRequest.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  fireEvent.click(screen.getByText("Confirm"));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith("users/student1/status", expect.objectContaining({ method: "PATCH", body: '{"status":"inactive"}' })));
  expect(await screen.findByText("Account disabled.")).toBeInTheDocument();
});

test("overview renders actual response totals and honest empty logs", async () => {
  adminRequest.mockResolvedValue({ students: 41, teachers: 7, classes: 9, submissions: 200, active: 48, inactive: 0, recent_users: [], recent_activity: [] });
  show("/admin/dashboard", <AdminDashboard profile={profile} />);
  expect(await screen.findByText("41")).toBeInTheDocument();
  expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
});

test("class detail shows enrolled students without teacher actions", async () => {
  adminRequest.mockResolvedValueOnce({ items: [{ id: "c1", classroom_name: "English", students: 1, activities: 2 }], total: 1 })
    .mockResolvedValueOnce({ id: "c1", classroom_name: "English", activities: 2, submissions: 1, students: [user] });
  show("/admin/classes", <AdminDashboard profile={profile} />);
  fireEvent.click(await screen.findByText("View class"));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Alex Santos");
  expect(screen.queryByText("Create assignment")).not.toBeInTheDocument();
});

test.each(["student", "teacher"])("%s cannot open admin routes even with admin metadata", async (role) => {
  mockAccount({ ...profile, role });
  show("/admin/users", <Routes><Route path="/admin/*" element={<Dashboard adminOnly session={{ user: { id: "admin1", user_metadata: { role: "admin" } } }} />} /><Route path="/dashboard" element={<div>Regular workspace</div>} /></Routes>);
  expect(await screen.findByText("Regular workspace")).toBeInTheDocument();
  expect(adminRequest).not.toHaveBeenCalled();
});

test.each(["student", "teacher"])("active %s still opens their existing workspace", async (role) => {
  mockAccount({ ...profile, role });
  show("/dashboard", <Dashboard session={{ user: { id: "admin1" } }} />);
  expect(await screen.findByText(role === "student" ? "Student workspace" : "Teacher workspace")).toBeInTheDocument();
});

test("inactive account does not render a workspace", async () => {
  mockAccount({ ...profile, account_status: "inactive" });
  show("/admin/dashboard", <Dashboard adminOnly session={{ user: { id: "admin1" } }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("inactive");
  expect(adminRequest).not.toHaveBeenCalled();
});

test("admin entering the regular dashboard is redirected to the admin route", async () => {
  mockAccount(profile);
  show("/dashboard", <Routes><Route path="/dashboard" element={<Dashboard session={{ user: { id: "admin1" } }} />} /><Route path="/admin/dashboard" element={<div>Admin destination</div>} /></Routes>);
  expect(await screen.findByText("Admin destination")).toBeInTheDocument();
});


test.each(["pending", "rejected"])("%s accounts cannot enter workspaces even with active local preferences", async (status) => {
  localStorage.setItem("writecheck_profile_prefs_admin1", JSON.stringify({ account_status: "active", role: "admin" }));
  mockAccount({ ...profile, role: "student", account_status: status });
  show("/dashboard", <Dashboard session={{ user: { id: "admin1", user_metadata: { role: "admin", account_status: "active" } } }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(status === "pending" ? "awaiting administrator approval" : "rejected");
  expect(screen.queryByText("Student workspace")).not.toBeInTheDocument();
  localStorage.removeItem("writecheck_profile_prefs_admin1");
});

test("unavailable authoritative profile never grants access from session metadata", async () => {
  mockAccount(null);
  show("/dashboard", <Dashboard session={{ user: { id: "admin1", user_metadata: { role: "teacher" } } }} />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Teacher workspace")).not.toBeInTheDocument();
});

test.each([["Approve", "active"], ["Reject", "rejected"]])("admin can %s a pending registration", async (label, status) => {
  adminRequest.mockResolvedValue({ items: [{ ...user, account_status: "pending" }], total: 1 });
  show("/admin/users", <AdminDashboard profile={profile} />);
  fireEvent.click(await screen.findByText(label));
  fireEvent.click(screen.getByText("Confirm"));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith("users/student1/status", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status }) })));
});

test("a profile for a different account never authorizes the current session", async () => {
  mockAccount({ ...profile, id: "different-account" });
  show("/dashboard", <Dashboard session={{ user: { id: "admin1" } }} />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Student workspace")).not.toBeInTheDocument();
});
