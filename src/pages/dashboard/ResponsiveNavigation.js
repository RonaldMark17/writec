import { SignOutAction } from "../../SignOutConfirmation";
import { getInitials, isCustomAvatarUrl } from "./shared";
import { profileName, profileRole } from "../../profileIdentity";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ThemeToggle from "../../ThemeToggle";

// Existing destinations are reused on desktop and inside the mobile drawer.
export default function ResponsiveNavigation({ label, current, children, className = "", profile, actions, navigationBlocked = false, onSignOut }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const drawer = panel.current;
    const menuButton = trigger.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    drawer?.querySelector("button")?.focus();
    const media = window.matchMedia?.("(min-width: 1024px)");
    const resize = () => { if (media?.matches) setOpen(false); };
    media?.addEventListener?.("change", resize);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      media?.removeEventListener?.("change", resize);
      // A destination may have opened another dialog; do not steal its focus.
      if (document.activeElement === document.body || drawer?.contains(document.activeElement)) menuButton?.focus();
    };
  }, [open]);
  const content = <div id={id} className="wc-navigation-content" data-open={open} onClick={event => {
    const target = event.target.closest("button, a");
    if (open && !navigationBlocked && target && !target.closest("[data-keep-menu-open]") &&
        (!event.defaultPrevented || target.hasAttribute("data-drawer-destination"))) close();
  }}>{children}</div>;
  return <div className={`wc-navigation ${className}`}>
    <button ref={trigger} type="button" className="wc-menu-toggle" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      onClick={() => setOpen(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      <span>{label}</span><span className="wc-menu-current">{current}</span>
    </button>
    {!open && content}
    {open && createPortal(<div className="wc-drawer-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-label={`${label} navigation`} className="wc-drawer"
        onKeyDown={event => {
          if (event.key === "Escape") { event.stopPropagation(); close(); }
          if (event.key !== "Tab") return;
          const controls = [...panel.current.querySelectorAll('button:not(:disabled), a[href]')];
          const first = controls[0], last = controls.at(-1);
          if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault(); (event.shiftKey ? last : first)?.focus();
          }
        }}>
        <div className="wc-drawer-header"><div><strong>WriteCheck</strong>
          {profile && <><div className="mt-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#137333] text-white overflow-hidden">{isCustomAvatarUrl(profile.avatarUrl) ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(profile.full_name || "User")}</div><p className="font-semibold">{profileName(profile)}</p><p className="wc-profile-role">{profileRole(profile)}</p></>}
        </div><button type="button" aria-label="Close menu" title="Close menu" onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button></div>
        {content}
        {actions && <div className="wc-menu-actions" onClick={close}>{actions}</div>}
        <div className="wc-drawer-theme"><p className="mb-2 text-sm">Appearance</p><ThemeToggle inline /></div>
        {onSignOut && <div className="wc-drawer-signout"><SignOutAction onClick={event => { onSignOut(event); close(); }} /></div>}
      </section>
    </div>, document.body)}
  </div>;
}
