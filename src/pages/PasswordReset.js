import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

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
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fa] p-6">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">{resetting ? "Set a new password" : "Forgot password?"}</h1>
        {isAuthLoading ? <p className="mt-4">Checking reset link…</p> : invalidLink && !done ? (
          <p role="alert" className="mt-4 text-red-700">This reset link is invalid or expired. <Link className="underline" to="/forgot-password">Request a new link</Link>.</p>
        ) : !done && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {resetting ? <>
              <label className="block text-sm font-medium">New password
                <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border p-3" />
              </label>
              <label className="block text-sm font-medium">Confirm password
                <input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-lg border p-3" />
              </label>
            </> : <label className="block text-sm font-medium">Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border p-3" />
            </label>}
            <button disabled={busy} className="w-full rounded-lg bg-emerald-700 p-3 text-white disabled:opacity-50">{busy ? "Please wait…" : resetting ? "Save password" : "Send reset link"}</button>
          </form>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 text-sm text-emerald-700">{message}</p>}
        <Link className="mt-5 inline-block text-sm text-emerald-700 underline" to={done ? "/dashboard" : "/login"}>{done ? "Continue to workspace" : "Back to login"}</Link>
      </div>
    </main>
  );
}
