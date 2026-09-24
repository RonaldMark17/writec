import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";
import Dashboard from "./Dashboard";
import { adminRequest } from "../apiFetch";
import { supabase } from "../supabaseClient";

jest.mock("../apiFetch", () => ({ adminRequest: jest.fn() }));
jest.mock("../supabaseClient", () => ({ supabase: { rpc: jest.fn() }, signOutAndExpireToken: jest.fn() }));
jest.mock("./StudentDashboard", () => () => <div>Student workspace</div>);
jest.mock("./TeacherDashboard", () => () => <div>Teacher workspace</div>);
const profile = { id: "admin1", full_name: "Admin Name", email: "admin@example.com", role: "admin", account_status: "active" };
const user = { id: "student1", full_name: "Alex Santos", email: "alex@example.com", role: "student", account_status: "active", registered_at: null };
function show(path, element) {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>);
}
beforeEach(() => jest.clearAllMocks());

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
  supabase.rpc.mockResolvedValue({ data: { ...profile, role } });
  show("/admin/users", <Routes><Route path="/admin/*" element={<Dashboard adminOnly session={{ user: { id: "u1", user_metadata: { role: "admin" } } }} />} /><Route path="/dashboard" element={<div>Regular workspace</div>} /></Routes>);
  expect(await screen.findByText("Regular workspace")).toBeInTheDocument();
  expect(adminRequest).not.toHaveBeenCalled();
});

test.each(["student", "teacher"])("active %s still opens their existing workspace", async (role) => {
  supabase.rpc.mockResolvedValue({ data: { ...profile, role } });
  show("/dashboard", <Dashboard session={{ user: { id: "u1" } }} />);
  expect(await screen.findByText(role === "student" ? "Student workspace" : "Teacher workspace")).toBeInTheDocument();
});

test("inactive account does not render a workspace", async () => {
  supabase.rpc.mockResolvedValue({ data: { ...profile, account_status: "inactive" } });
  show("/admin/dashboard", <Dashboard adminOnly session={{ user: { id: "u1" } }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("inactive");
  expect(adminRequest).not.toHaveBeenCalled();
});

test("admin entering the regular dashboard is redirected to the admin route", async () => {
  supabase.rpc.mockResolvedValue({ data: profile });
  show("/dashboard", <Routes><Route path="/dashboard" element={<Dashboard session={{ user: { id: "u1" } }} />} /><Route path="/admin/dashboard" element={<div>Admin destination</div>} /></Routes>);
  expect(await screen.findByText("Admin destination")).toBeInTheDocument();
});
