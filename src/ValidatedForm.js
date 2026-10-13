import { createContext, forwardRef, useContext, useId, useLayoutEffect, useRef, useState } from "react";

const Validation = createContext(null);
function labelFor(input) {
  return [...(input.labels || [])].map(label => {
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input,textarea,select,button,[role=alert]").forEach(node => node.remove());
    return copy.textContent.replace(/\s+/g, " ").trim();
  }).join(" ");
}
function messageFor(input) {
  if (input.disabled || !input.willValidate) return "";
  const label = input.dataset.validationLabel || input.getAttribute("aria-label")
    || labelFor(input) || input.name || "This field";
  const name = label.replace(/\(required\)|\*/gi, "").replace(/\s+/g, " ").trim();
  const readable = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (input.required && !String(input.value || "").trim()) return `${readable} is required.`;
  return input.validity.valid ? "" : input.validationMessage;
}

export default function ValidatedForm({ onSubmit, onChange, onValidationError, children, ...props }) {
  const [errors, setErrors] = useState({});
  const pending = useRef(false);
  const submit = async event => {
    event.preventDefault();
    if (pending.current) return;
    const fields = [...event.currentTarget.elements].filter(field => field.matches("input,textarea,select"));
    const invalid = fields.map(field => [field, messageFor(field)]).filter(([, message]) => message);
    setErrors(Object.fromEntries(invalid.map(([field, message]) => [field.id, message])));
    if (invalid.length) {
      onValidationError?.(invalid[0][0]);
      invalid[0][0].focus();
      if (onValidationError) requestAnimationFrame(() => invalid[0][0].focus());
      return;
    }
    pending.current = true;
    try { await onSubmit?.(event); } finally { pending.current = false; }
  };
  return <Validation.Provider value={errors}><form {...props} noValidate onSubmit={submit} onChange={event => {
    const field = event.target;
    if (errors[field.id]) setErrors(previous => ({ ...previous, [field.id]: messageFor(field) }));
    onChange?.(event);
  }}>{children}</form></Validation.Provider>;
}

function field(tag) {
  return forwardRef(function ValidatedField({ id: suppliedId, validationLabel, ...props }, ref) {
    const generatedId = useId();
    const element = useRef(null);
    const [label, setLabel] = useState("");
    // Inline errors inside a wrapping label must describe, not rename, its control.
    useLayoutEffect(() => {
      const next = labelFor(element.current);
      if (next !== label) setLabel(next);
    }, [label, suppliedId, validationLabel]);
    const id = suppliedId || generatedId;
    const errors = useContext(Validation);
    const error = errors?.[id];
    const Tag = tag;
    return <><Tag {...props} id={id} ref={node => {
      element.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }} data-validation-label={validationLabel}
      aria-label={props["aria-label"] || (props["aria-labelledby"] ? undefined : label || undefined)}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[props["aria-describedby"], error && `${id}-required-error`].filter(Boolean).join(" ") || undefined}
      className={`${props.className || ""}${error ? " field-invalid" : ""}`} />
      {error && <span id={`${id}-required-error`} role="alert" className="validation-error field-error">{error}</span>}</>;
  });
}
export const ValidatedInput = field("input");
export const ValidatedTextarea = field("textarea");
export const ValidatedSelect = field("select");
