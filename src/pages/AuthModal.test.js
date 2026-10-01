import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthModal from "./AuthModal";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: { auth: { signUp: jest.fn() }, from: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

function register(role = "student", email = "Alex@EDU.COM.PH") {
  const onClose = jest.fn();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthModal initialMode="register" onClose={onClose} />
  </MemoryRouter>);
  if (role === "teacher") fireEvent.click(screen.getByRole("button", { name: /Teacher Create classes/i }));
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Smith" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: /Create (Student|Teacher) Account/ }));
  return onClose;
}

test.each(["student", "teacher"])("rejects concealed duplicate for %s without changing the profile", async (role) => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "concealed", identities: [] }, session: null }, error: null });
  const onClose = register(role);
  expect(await screen.findByRole("alert")).toHaveTextContent("This email is already registered");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(supabase.from).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "alex@edu.com.ph" }));
});

test.each([
  { code: "user_already_exists", message: "Duplicate" },
  { code: "email_exists", message: "Duplicate" },
  { message: "User already registered" },
])("shows a useful message for duplicate errors: %j", async (error) => {
  supabase.auth.signUp.mockResolvedValue({ data: null, error });
  register();
  expect(await screen.findByRole("alert")).toHaveTextContent("Please sign in or reset your password");
  expect(supabase.from).not.toHaveBeenCalled();
});

test("new accounts still receive the confirmation message", async () => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ id: "identity" }] }, session: null }, error: null });
  register();
  expect(await screen.findByRole("status")).toHaveTextContent("Verification email sent");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("new accounts with a session wait for administrator approval", async () => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ id: "identity" }] }, session: { access_token: "test" } }, error: null });
  const onClose = register();
  expect(await screen.findByRole("status")).toHaveTextContent("awaiting administrator approval");
  expect(onClose).not.toHaveBeenCalled();
  expect(supabase.from).not.toHaveBeenCalled();
});

test("a network failure allows retrying", async () => {
  supabase.auth.signUp.mockRejectedValue(new Error("Network failure"));
  register();
  expect(await screen.findByRole("alert")).toHaveTextContent("check your connection");
  expect(screen.getByRole("button", { name: "Create Student Account" })).toBeEnabled();
});

test("unrelated errors are not reported as duplicate emails", async () => {
  supabase.auth.signUp.mockResolvedValue({ data: null, error: { code: "over_email_send_rate_limit", message: "Too many attempts" } });
  register();
  expect(await screen.findByRole("alert")).toHaveTextContent("email sending limit has been reached");
});

test.each(["{}", "", undefined])("empty server error %j gets a useful fallback", async (message) => {
  supabase.auth.signUp.mockResolvedValue({ data: null, error: { message } });
  register();
  expect(await screen.findByRole("alert")).toHaveTextContent("Registration could not be completed");
  expect(screen.getByRole("button", { name: "Create Student Account" })).toBeEnabled();
});

test("email delivery errors explain the verification failure", async () => {
  supabase.auth.signUp.mockResolvedValue({ data: null, error: { message: "Error sending confirmation email" } });
  register();
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't send your verification email");
});


test.each(["user@gmail.com", "user@other.edu.com.ph", "user@edu.com.ph.evil.com", "user@school.edu.ph.evil.com", "user@fakeedu.ph", "user@-school.edu.ph", "user@school..edu.ph"])("rejects non-approved domain %s before contacting Auth", (email) => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Student Account" }).closest("form"));
  expect(screen.getByRole("alert")).toHaveTextContent("@edu.com.ph");
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test.each(["student", "teacher"])("accepts .edu.ph registration for %s and still requires approval", async (role) => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ id: "identity" }] }, session: {} }, error: null });
  register(role, "Alex@DEPT.SCHOOL.EDU.PH");
  expect(await screen.findByRole("status")).toHaveTextContent("awaiting administrator approval");
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "alex@dept.school.edu.ph" }));
});
