import { useId, useRef, useState } from "react";

// One destination list serves desktop and the compact mobile menu.
export default function ResponsiveNavigation({ label, current, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef(null);
  return <div className={`wc-navigation ${className}`} onKeyDown={event => {
    if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="wc-menu-toggle" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      <span>{label}</span><span className="wc-menu-current">{current}</span>
    </button>
    <div id={id} className="wc-navigation-content" data-open={open} onClick={event => {
      if (open && !event.defaultPrevented && event.target.closest("button, a")) { setOpen(false); trigger.current?.focus(); }
    }}>{children}</div>
  </div>;
}
