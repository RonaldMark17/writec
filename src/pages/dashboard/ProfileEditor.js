import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export function ProfileIcon({ className = "h-10 w-10" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>;
}

export default function ProfileEditor({ profile, onSaved, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  function handleKeys(event) {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key !== "Tab") return;
    const items = dialogRef.current.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)');
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const [name, setName] = useState(profile.full_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim()) { setError("Enter your full name."); return; }
    setBusy(true);
    try {
      const { data, error: saveError } = await supabase.rpc("update_my_profile", { new_full_name: name.trim() });
      if (saveError) throw saveError;
      if (!data?.length) throw new Error("Your profile could not be saved.");
      onSaved({ ...profile, full_name: data[0].full_name });
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.message || "Unable to save your profile. Please try again.");
    } finally { setBusy(false); }
  }
  return createPortal(
    <div onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4 backdrop-blur-sm">
      <section ref={dialogRef} tabIndex={-1} onKeyDown={handleKeys} role="dialog" aria-modal="true" aria-labelledby="profile-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/70 bg-white p-6 shadow-2xl outline-none sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-4 ring-emerald-50/50"><ProfileIcon /></div>
          <h2 id="profile-title" className="mt-4 text-2xl font-bold text-gray-950">Your profile</h2>
          <p className="mt-2 break-words text-xl font-semibold text-gray-800">{profile.full_name}</p>
          <p className="mt-1 text-sm capitalize text-emerald-700">{profile.role} workspace</p>
        </div>
        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block text-base font-medium">Display name
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-base focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          </label>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Registered email</p>
            <p className="mt-1 break-words text-base text-gray-800">{profile.email}</p>
          </div>
          <Link to="/forgot-password" className="inline-block text-sm text-emerald-700 underline">Reset password</Link>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">Close</button>
            <button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      </section>
    </div>, document.body
  );
}
