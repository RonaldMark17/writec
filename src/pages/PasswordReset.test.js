import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PasswordReset from "./PasswordReset";
import ProfileEditor from "./dashboard/ProfileEditor";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({ supabase: { auth: { resetPasswordForEmail: jest.fn(), updateUser: jest.fn() }, rpc: jest.fn() } }));
const show = (element) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}</MemoryRouter>);
beforeEach(() => jest.clearAllMocks());

test("sends a recovery email with the reset route", async () => {
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  show(<PasswordReset />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
  fireEvent.click(screen.getByText("Send reset link"));
  expect(await screen.findByRole("status")).toHaveTextContent("If an account exists");
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", { redirectTo: `${window.location.origin}/reset-password` });
});

test("rejects mismatched passwords and saves matching passwords", async () => {
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  const complete = jest.fn();
  show(<PasswordReset mode="reset" session={{ user: { id: "s1" } }} onComplete={complete} />);
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different123" } });
  fireEvent.click(screen.getByText("Save password"));
  expect(screen.getByRole("alert")).toHaveTextContent("both passwords match");
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "newpassword123" } });
  fireEvent.click(screen.getByText("Save password"));
  expect(await screen.findByRole("status")).toHaveTextContent("password has been updated");
  expect(complete).toHaveBeenCalled();
});

test("invalid reset sessions cannot set a password", () => {
  show(<PasswordReset mode="reset" session={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired");
  expect(screen.queryByText("Save password")).not.toBeInTheDocument();
});

test.each(["student", "teacher"])("saves a %s name and preserves their role", async (role) => {
  supabase.rpc.mockResolvedValue({ data: [{ full_name: "New Name" }] });
  const saved = jest.fn();
  show(<ProfileEditor profile={{ id: "u1", full_name: "Old Name", role }} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " New Name " } });
  fireEvent.click(screen.getByText("Save profile"));
  expect(await screen.findByRole("status")).toHaveTextContent("Profile updated");
  expect(supabase.rpc).toHaveBeenCalledWith("update_my_profile", { new_full_name: "New Name" });
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ full_name: "New Name", role }));
});

test("profile errors do not report success", async () => {
  supabase.rpc.mockResolvedValue({ error: { message: "Unable to save" } });
  const saved = jest.fn();
  show(<ProfileEditor profile={{ full_name: "Name" }} onSaved={saved} />);
  fireEvent.click(screen.getByText("Save profile"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save");
  expect(saved).not.toHaveBeenCalled();
});
