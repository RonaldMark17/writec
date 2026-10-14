import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOutAndExpireToken } from "./supabaseClient";

function Confirmation({ onClose, returnTo }) {
  const id = useId(), panel = useRef(null), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      const target = returnTo?.isConnected ? returnTo : [...document.querySelectorAll('.wc-menu-toggle')].find(el => el.getClientRects().length);
      target?.focus();
    };
  }, [returnTo]);
  return createPortal(<div className="signout-backdrop" onClick={e => e.stopPropagation()}>
    <section className="signout-dialog wc-modal-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-description`}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" && !submitting.current) onClose();
        if (event.key !== "Tab") return;
        const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')];
        if (!buttons.length) { event.preventDefault(); return; }
        if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
          event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0]).focus();
        }
      }}>
      <h2 id={id} className="text-xl font-semibold">Sign out of WriteCheck?</h2>
      <p id={`${id}-description`} className="mt-3">Are you sure you want to sign out of your account?</p>
      {error && <p role="alert" className="validation-error mt-3">{error}</p>}
      <div className="signout-actions">
        <button type="button" className="similarity-chip" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="account-signout" disabled={busy} onClick={async () => {
          if (submitting.current) return;
          submitting.current=true; setBusy(true); setError("");
          try { await signOutAndExpireToken("/login"); }
          catch { setError("Could not sign out. Please try again."); }
          finally { submitting.current=false; setBusy(false); }
        }}>{busy ? "Signing out..." : "Sign Out"}</button>
      </div>
    </section>
  </div>, document.body);
}
export function useSignOutConfirmation() {
  const [request, setRequest] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const requestSignOut = event => {
    const returnTo = event?.currentTarget || document.activeElement;
    // Let an originating drawer finish closing before taking the modal scroll lock.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRequest({returnTo}), 0);
  };
  return { requestSignOut, signOutDialog: request && <Confirmation returnTo={request.returnTo} onClose={() => setRequest(null)} /> };
}
export function SignOutButton({ children = "Sign out", ...props }) {
  const {requestSignOut, signOutDialog} = useSignOutConfirmation();
  return <><button type="button" {...props} onClick={requestSignOut}>{children}</button>{signOutDialog}</>;
}
