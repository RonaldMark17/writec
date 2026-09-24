import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* ─── SVG Icons ─────────────────────────────────────────────── */
function EyeIcon({ open, className = "h-5 w-5" }) {
  return open ? (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function ClassroomIcon({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <polyline points="10 2 10 10 13 7 16 10 16 2" />
    </svg>
  );
}

function MailIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UserIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

function StudentIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function TeacherIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h20" />
      <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
      <path d="m7 21 5-5 5 5" />
    </svg>
  );
}

export default function AuthModal({ initialMode = "login", onClose, onModeChange }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // "login" | "register"

  // Sync mode if initialMode prop changes
  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  // Common Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Register Form States
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState("student");

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (onClose) onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Switch between Login and Register
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
    if (onModeChange) onModeChange(nextMode);
  };

  // Handle Login Submission
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsLoading(false);
    if (error) {
      setErrorMessage(error.message);
    } else {
      if (onClose) onClose();
      navigate("/dashboard");
    }
  };

  // Handle Register Submission
  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: role,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    if (data.session && data.user?.id) {
      const { error: profileError } = await supabase
        .from("userTable")
        .upsert([
          {
            id: data.user.id,
            full_name: fullName.trim(),
            email: email.trim(),
            role: role,
          },
        ]);

      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      if (onClose) onClose();
      navigate("/dashboard");
      return;
    }

    setSuccessMessage("Verification email sent! Check your inbox to confirm your account.");
    setIsLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-5 transition-all duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="relative w-full max-w-[490px] max-h-[92vh] overflow-y-auto no-scrollbar rounded-[28px] border border-[#e8eaed] bg-white shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] transition-all">
        {/* Top Decorative Classroom Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#0d652d] via-[#137333] to-[#34a853]" />

        {/* Modal Inner Container */}
        <div className="p-6 sm:p-8">
          {/* Close Button ✕ */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 sm:right-5 sm:top-5 flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124] transition z-10"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Header Strip: Brand + Classroom Tag */}
          <div className="flex items-center justify-between gap-3 pr-10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#137333] to-[#1e8e3e] text-white shadow-md shadow-[#137333]/25">
                <ClassroomIcon className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight text-[#202124]">WriteCheck</span>
                  <span className="inline-flex items-center rounded-md bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-semibold text-[#137333]">
                    Classroom
                  </span>
                </div>
                <span className="text-[11px] text-[#5f6368]">Academic Integrity & Essay Station</span>
              </div>
            </div>
          </div>

          {/* Segmented Pill Tab Switcher */}
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#f1f3f4] p-1 border border-[#dadce0]/70">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all ${
                mode === "login"
                  ? "bg-white text-[#137333] shadow-xs"
                  : "text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all ${
                mode === "register"
                  ? "bg-white text-[#137333] shadow-xs"
                  : "text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Subtitle / Mode prompt */}
          <div className="mt-4">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">
              {mode === "login" ? "Welcome back" : "Get started with WriteCheck"}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
              {mode === "login"
                ? "Enter your credentials to access your classroom dashboard"
                : "Choose your role and register to begin submitting or checking essays"}
            </p>
          </div>

          {/* ═══════════════════════════════════════════════════
              LOGIN FORM
          ═══════════════════════════════════════════════════ */}
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="modal-login-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6368]">
                    <MailIcon className="h-4 w-4" />
                  </div>
                  <input
                    id="modal-login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 sm:h-12 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] pl-10 pr-3.5 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="modal-login-password"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#444746]"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    onClick={() => onClose && onClose()}
                    className="text-xs font-medium text-[#137333] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6368]">
                    <LockIcon className="h-4 w-4" />
                  </div>
                  <input
                    id="modal-login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 sm:h-12 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] pl-10 pr-11 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] transition"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={showPassword} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#fad2cf] bg-[#fce8e6] p-3 text-[#c5221f]">
                  <svg className="h-4 w-4 shrink-0 mt-0.5 text-[#c5221f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs font-medium leading-5">{errorMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#137333] px-6 text-sm font-semibold text-white shadow-md shadow-[#137333]/25 transition hover:bg-[#0f5b28] hover:shadow-lg hover:shadow-[#137333]/30 focus:outline-none focus:ring-4 focus:ring-[#e6f4ea] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  "Sign In to Classroom"
                )}
              </button>

              <div className="pt-2 text-center text-xs text-[#5f6368]">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-semibold text-[#137333] hover:underline"
                >
                  Create an account
                </button>
              </div>
            </form>
          ) : (
            /* ═══════════════════════════════════════════════════
               REGISTER FORM
            ═══════════════════════════════════════════════════ */
            <form onSubmit={handleRegister} className="mt-5 space-y-3.5" noValidate>
              {/* Role Selection Cards */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-2">
                  I am registering as:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`flex flex-col items-start rounded-2xl border-2 p-3 text-left transition-all ${
                      role === "student"
                        ? "border-[#137333] bg-[#e6f4ea]/60 shadow-xs"
                        : "border-[#dadce0] bg-[#fafafa] hover:border-[#bdc1c6] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        role === "student" ? "bg-[#137333] text-white" : "bg-[#e8eaed] text-[#5f6368]"
                      }`}>
                        <StudentIcon className="h-4 w-4" />
                      </div>
                      <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        role === "student" ? "border-[#137333]" : "border-[#dadce0]"
                      }`}>
                        {role === "student" && <span className="h-2 w-2 rounded-full bg-[#137333]" />}
                      </span>
                    </div>
                    <span className="mt-2.5 text-xs font-bold text-[#202124]">Student</span>
                    <span className="text-[11px] text-[#5f6368] leading-tight">Submit work & review grades</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`flex flex-col items-start rounded-2xl border-2 p-3 text-left transition-all ${
                      role === "teacher"
                        ? "border-[#137333] bg-[#e6f4ea]/60 shadow-xs"
                        : "border-[#dadce0] bg-[#fafafa] hover:border-[#bdc1c6] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        role === "teacher" ? "bg-[#137333] text-white" : "bg-[#e8eaed] text-[#5f6368]"
                      }`}>
                        <TeacherIcon className="h-4 w-4" />
                      </div>
                      <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        role === "teacher" ? "border-[#137333]" : "border-[#dadce0]"
                      }`}>
                        {role === "teacher" && <span className="h-2 w-2 rounded-full bg-[#137333]" />}
                      </span>
                    </div>
                    <span className="mt-2.5 text-xs font-bold text-[#202124]">Teacher</span>
                    <span className="text-[11px] text-[#5f6368] leading-tight">Create classes & check essays</span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label
                  htmlFor="modal-register-fullname"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1"
                >
                  Full name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6368]">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <input
                    id="modal-register-fullname"
                    type="text"
                    autoComplete="name"
                    placeholder="Prof. Jane Doe or Alex Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-10 sm:h-11 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] pl-10 pr-3.5 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label
                  htmlFor="modal-register-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6368]">
                    <MailIcon className="h-4 w-4" />
                  </div>
                  <input
                    id="modal-register-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 sm:h-11 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] pl-10 pr-3.5 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                  />
                </div>
              </div>

              {/* Password Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="modal-register-password"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="modal-register-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Min. 6 chars"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-10 sm:h-11 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3.5 pr-9 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] transition"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showPassword} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="modal-register-confirm"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id="modal-register-confirm"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="h-10 sm:h-11 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3.5 pr-9 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] transition"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showConfirmPassword} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#fad2cf] bg-[#fce8e6] p-3 text-[#c5221f]">
                  <svg className="h-4 w-4 shrink-0 mt-0.5 text-[#c5221f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs font-medium leading-5">{errorMessage}</p>
                </div>
              )}

              {successMessage && (
                <div role="status" className="flex items-start gap-2.5 rounded-xl border border-[#ceead6] bg-[#e6f4ea] p-3 text-[#137333]">
                  <svg className="h-4 w-4 shrink-0 mt-0.5 text-[#137333]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <p className="text-xs font-medium leading-5">{successMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#137333] px-6 text-sm font-semibold text-white shadow-md shadow-[#137333]/25 transition hover:bg-[#0f5b28] hover:shadow-lg hover:shadow-[#137333]/30 focus:outline-none focus:ring-4 focus:ring-[#e6f4ea] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Creating account…
                  </>
                ) : (
                  `Create ${role === "teacher" ? "Teacher" : "Student"} Account`
                )}
              </button>

              <div className="pt-2 text-center text-xs text-[#5f6368]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-semibold text-[#137333] hover:underline"
                >
                  Sign in
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
