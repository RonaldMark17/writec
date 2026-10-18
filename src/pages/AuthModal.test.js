import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthModal from "./AuthModal";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: { auth: { signUp: jest.fn() }, from: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

test("invalid domain is reported while typing, before blur or submission", () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  const email = screen.getByLabelText("Email address");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(email, { target: { value: "student@gmail.com" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Please use an institutional email address such as name@school.edu.ph.");
  fireEvent.change(email, { target: { value: "student@school.edu.ph" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(email, { target: { value: "" } });
  fireEvent.blur(email);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

function register(role = "student", email = "Alex@SCHOOL.EDU.PH") {
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
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "alex@school.edu.ph" }));
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


test.each(["user@edu.ph", "user@edu.com.ph", "user@yahoo.com", "user@edu.com", "user@gmail.com", "user@other.edu.com.ph", "user@school.edu.ph.evil.com", "user@school.edu.ph.evil.com", "user@fakeedu.ph", "user@-school.edu.ph", "user@school..edu.ph"])("rejects non-approved domain %s before contacting Auth", (email) => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Smith" } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Student Account" }).closest("form"));
  expect(screen.getAllByRole("alert").some(alert => alert.textContent.includes("@school.edu.ph"))).toBe(true);
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test.each(["student", "teacher"])("accepts uppercase exact-domain registration for %s and still requires approval", async (role) => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ id: "identity" }] }, session: {} }, error: null });
  register(role, "Alex@SCHOOL.EDU.PH");
  expect(await screen.findByRole("status")).toHaveTextContent("awaiting administrator approval");
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "alex@school.edu.ph" }));
});

test.each(["Full name", "Email address", "Password", "Confirm password"])("registration rejects a blank %s even when browser validation is bypassed", (field) => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  for (const [label, value] of [["Full name", "Alex Smith"], ["Email address", "alex@school.edu.ph"], ["Password", "password123"], ["Confirm password", "password123"]]) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: label === field ? "   " : value } });
  }
  const submit = screen.getByRole("button", { name: "Create Student Account" });
  expect(submit).toBeEnabled();
  fireEvent.submit(submit.closest("form"));
  expect(screen.getByRole("alert")).toHaveTextContent(`${field.charAt(0).toUpperCase()}${field.slice(1).toLowerCase()} is required.`);
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test("registration allows validation attempts and still rejects mismatched passwords", () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  const submit = screen.getByRole("button", { name: "Create Student Account" });
  expect(submit).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@school.edu.ph" } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "password123" } });
  expect(submit).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different123" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test.each(["student", "teacher"])("%s sees early domain feedback that clears immediately", role => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthModal initialMode="register" /></MemoryRouter>);
  if (role === "teacher") fireEvent.click(screen.getByRole("button", {name:/Teacher Create classes/i}));
  const email = screen.getByLabelText("Email address");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(email, {target:{value:"alex"}});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.blur(email);
  expect(screen.getAllByRole("alert").some(alert => alert.textContent.includes("@school.edu.ph"))).toBe(true);
  fireEvent.change(email, {target:{value:"alex@gmail.com"}});
  expect(email).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", {name:/Create (Student|Teacher) Account/})).toBeEnabled();
  fireEvent.change(email, {target:{value:"alex@SCHOOL.EDU.PH"}});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(email).toHaveAttribute("aria-invalid", "false");
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
 });

test.each(["student", "teacher"])("accepts institutional subdomains for %s", async role => {
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "new", identities: [{ id: "identity" }] }, session: null }, error: null });
  register(role, "Alex@DEPT.SCHOOL.EDU.PH");
  expect(await screen.findByRole("status")).toHaveTextContent("Verification email sent");
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "alex@dept.school.edu.ph" }));
});

test.each(["login", "register"])("%s password visibility preserves the value and resets when switching forms", (mode) => {
  const { rerender } = render(<MemoryRouter><AuthModal initialMode={mode} /></MemoryRouter>);
  const password = screen.getByLabelText("Password", { exact: true });
  fireEvent.change(password, { target: { value: "example-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Show password", exact: true }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("example-password");
  expect(screen.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (mode === "register") {
    const confirmation = screen.getByLabelText("Confirm password");
    expect(confirmation).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show confirm password" }));
    expect(confirmation).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide confirm password" }));
    expect(confirmation).toHaveAttribute("type", "password");
  }
  fireEvent.click(screen.getByRole("button", { name: "Hide password", exact: true }));
  expect(password).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Show password", exact: true }));
  rerender(<MemoryRouter><AuthModal initialMode={mode === "login" ? "register" : "login"} /></MemoryRouter>);
  expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute("type", "password");
});
