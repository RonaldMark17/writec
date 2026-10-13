import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, CopyIcon } from "./shared";

export function ClassCode({ code }) {
  const [message, setMessage] = useState("");
  useEffect(() => { setMessage(""); }, [code]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!code) return null;
  return <div className="classroom-code">
    <span>Class code</span> <strong className="font-mono break-all">{code}</strong>
    <button type="button" className="classroom-icon" title="Copy class code" aria-label="Copy class code"
      onClick={async event => {
        event.stopPropagation();
        try { await navigator.clipboard.writeText(code); setMessage("Class code copied."); }
        catch { setMessage("Could not copy. Select and copy the class code above."); }
      }}><CopyIcon className="h-4 w-4" /></button>
    <span role="status" className="text-xs">{message}</span>
  </div>;
}

function InformationDialog({ classroom, teacherView, onClose }) {
  const titleId = useId();
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus();
    return () => previous?.focus();
  }, []);
  const fields = [
    ["Classroom name", classroom.name],
    ["Subject", classroom.subject === "No subject" ? null : classroom.subject],
    ["Section", classroom.section === "No section" ? null : classroom.section],
    ["Teacher", classroom.teacher],
    ...(teacherView ? [["Students", classroom.students], ["Status", classroom.isArchived ? "Archived" : "Active"]] : []),
  ];
  return createPortal(<div className="classroom-info-backdrop" onClick={event => event.stopPropagation()}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="classroom-info-dialog"
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
        if (event.key !== "Tab") return;
        const buttons = [...dialog.current.querySelectorAll("button")];
        if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
          event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0]).focus();
        }
      }}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">Classroom information</h2>
        <button type="button" className="classroom-icon" onClick={onClose} title="Close classroom information" aria-label="Close classroom information"><CloseIcon /></button>
      </div>
      <dl className="my-4 space-y-3">{fields.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) =>
        <div key={label}><dt className="text-xs">{label}</dt><dd className="font-medium break-words">{value}</dd></div>)}</dl>
      <ClassCode key={classroom.id} code={classroom.code} />
    </section>
  </div>, document.body);
}

export default function ClassroomInformation({ classroom, teacherView = false }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="classroom-icon" title="Classroom information" aria-label={`Classroom information: ${classroom.name}`}
      onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v2"/></svg>
    </button>
    {open && <InformationDialog classroom={classroom} teacherView={teacherView} onClose={() => setOpen(false)} />}
  </>;
}
