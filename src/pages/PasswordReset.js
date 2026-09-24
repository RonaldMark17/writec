import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* ─── Google Classroom Chalkboard Icon ─────────────────────── */
function ClassroomIcon({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <polyline points="10 2 10 10 13 7 16 10 16 2" />
    </svg>
  );
}

export default function PasswordReset({ mode = "request", session, isAuthLoading, onComplete = () => {} }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [linkError] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    return hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code");
  });
  const resetting = mode === "reset";
  const invalidLink = resetting && (!session || linkError);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (resetting && (password.length < 8 || password !== confirm)) {
      setError("Use at least 8 characters and make sure both passwords match.");
      return;
    }
    setBusy(true);
    try {
      if (resetting) {
        if (invalidLink) throw new Error("Request a new password reset link.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword("");
        setConfirm("");
        setDone(true);
        setMessage("Your password has been updated.");
        onComplete();
      } else {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (requestError) throw requestError;
        setMessage("If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder.");
      }
    } catch (err) {
      setError(err.message || "Unable to reset your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Navbar / Back Link */}
      <div className="mx-auto w-full max-w-[460px] flex items-center justify-between">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#5f6368] hover:text-[#137333] transition-colors rounded-full px-3 py-1.5 hover:bg-[#f1f3f4]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Sign in
        </Link>
      </div>

      {/* Main Centered Google Classroom Auth Card */}
      <div className="my-auto mx-auto w-full max-w-[460px]">
        <div className="w-full rounded-[24px] sm:rounded-[28px] border border-[#dadce0] bg-white p-7 sm:p-10 shadow-sm transition-all">
          {/* Brand Header */}
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#137333] text-white shadow-2xs">
                <ClassroomIcon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-[#202124]">WriteCheck</span>
                <span className="ml-2 inline-flex items-center rounded-md bg-[#e6f4ea] px-2 py-0.5 text-xs font-semibold text-[#137333]">
                  Classroom
                </span>
              </div>
            </div>

            <h1 className="mt-6 text-2xl sm:text-[28px] font-normal tracking-tight text-[#202124]">
              {resetting ? "Set a new password" : "Account recovery"}
            </h1>
            <p className="mt-1.5 text-sm text-[#5f6368]">
              {resetting
                ? "Enter your new password to regain access"
                : "Enter your email to receive a password reset link"}
            </p>
          </div>

          {isAuthLoading ? (
            <div className="mt-8 flex items-center justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
            </div>
          ) : invalidLink && !done ? (
            <div role="alert" className="mt-6 rounded-xl border border-[#fad2cf] bg-[#fce8e6] p-4 text-xs sm:text-sm text-[#c5221f]">
              <p className="font-semibold">This reset link is invalid or expired.</p>
              <Link to="/forgot-password" className="mt-2 inline-block font-bold text-[#137333] hover:underline">
                Request a new password link →
              </Link>
            </div>
          ) : !done ? (
            <form onSubmit={submit} className="mt-8 space-y-4">
              {resetting ? (
                <>
                  <div>
                    <label htmlFor="reset-new-password" className="block text-xs font-medium uppercase tracking-wider text-[#444746] mb-1.5">
                      New password
                    </label>
                    <input
                      id="reset-new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 w-full rounded-xl border border-[#dadce0] bg-white px-4 text-sm sm:text-base text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:border-[#137333] focus:ring-2 focus:ring-[#137333]/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="reset-confirm-password" className="block text-xs font-medium uppercase tracking-wider text-[#444746] mb-1.5">
                      Confirm password
                    </label>
                    <input
                      id="reset-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      placeholder="Re-enter new password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="h-12 w-full rounded-xl border border-[#dadce0] bg-white px-4 text-sm sm:text-base text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:border-[#137333] focus:ring-2 focus:ring-[#137333]/20"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-medium uppercase tracking-wider text-[#444746] mb-1.5">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="name@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#dadce0] bg-white px-4 text-sm sm:text-base text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:border-[#137333] focus:ring-2 focus:ring-[#137333]/20"
                  />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-[#fad2cf] bg-[#fce8e6] p-3.5 text-[#c5221f]"
                >
                  <p className="text-xs sm:text-sm font-medium leading-5">{error}</p>
                </div>
              )}

              {message && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-[#ceead6] bg-[#e6f4ea] p-3.5 text-[#137333]"
                >
                  <p className="text-xs sm:text-sm font-medium leading-5">{message}</p>
                </div>
              )}

              <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                <Link
                  to="/login"
                  className="text-sm font-medium text-[#137333] hover:bg-[#e6f4ea] px-3.5 py-2 rounded-full transition w-full sm:w-auto text-center"
                >
                  Back to login
                </Link>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#137333] px-7 text-sm font-medium text-white shadow-xs transition hover:bg-[#0f5b28] focus:outline-none focus:ring-4 focus:ring-[#e6f4ea] disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {busy ? "Sending…" : resetting ? "Save password" : "Send reset link"}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-8 space-y-4">
              <div role="status" className="rounded-xl border border-[#ceead6] bg-[#e6f4ea] p-4 text-sm text-[#137333]">
                {message}
              </div>
              <Link
                to={done ? "/dashboard" : "/login"}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#137333] text-sm font-medium text-white hover:bg-[#0f5b28] transition"
              >
                {done ? "Continue to dashboard" : "Back to login"}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Google Classroom Style Footer */}
      <footer className="mx-auto w-full max-w-[460px] pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5f6368]">
        <span>WriteCheck Classroom</span>
        <div className="flex items-center gap-4">
          <Link to="/" className="hover:underline">Help</Link>
          <Link to="/" className="hover:underline">Privacy</Link>
          <Link to="/" className="hover:underline">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
