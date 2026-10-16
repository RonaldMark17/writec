import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./studentSubmission.css";

const inertLocks = new WeakMap();
let openDialogs = 0;
let originalOverflow;

export default function StudentReviewDialog({ title, onClose, children, closeLabel = "Close submitted work" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (openDialogs++ === 0) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = [...document.body.children].filter(node => node !== ref.current.parentElement);
    siblings.forEach(node => {
      const lock = inertLocks.get(node) || { count: 0, original: Boolean(node.inert) };
      lock.count++;
      inertLocks.set(node, lock);
      node.inert = true;
    });
    ref.current.focus();
    return () => {
      siblings.forEach(node => {
        const lock = inertLocks.get(node);
        if (--lock.count === 0) { node.inert = lock.original; inertLocks.delete(node); }
      });
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="student-review-backdrop">
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className="student-review wc-modal-panel" onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key !== "Tab") return;
        const nodes = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input, textarea, select, summary, [tabindex="0"]')]
          .filter(node => !node.closest('[hidden]') && ![...ref.current.querySelectorAll('details:not([open])')].some(d => d.contains(node) && node !== d.querySelector('summary')));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { event.preventDefault(); ref.current.focus(); }
        else if (event.shiftKey && [first, ref.current].includes(document.activeElement)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && [last, ref.current].includes(document.activeElement)) { event.preventDefault(); first.focus(); }
      }}>
      <header className="student-review-heading"><h2>{title}</h2><button type="button" aria-label={closeLabel} onClick={onClose}>Close</button></header>
      {children}
    </section>
  </div>, document.body);
}

