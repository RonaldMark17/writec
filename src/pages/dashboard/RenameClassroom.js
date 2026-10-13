import { useEffect, useRef, useState } from "react";
import ValidatedForm, { ValidatedInput } from "../../ValidatedForm";
import { apiFetch, getBackendUrl } from "../../apiFetch";

export default function RenameClassroom({ classroom, onClose, onRenamed }) {
  const [name, setName] = useState(classroom.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("input")?.focus();
    return () => previous?.focus();
  }, []);
  const save = async () => {
    if (saving || !name.trim() || name.trim() === classroom.name) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch(`${getBackendUrl()}/api/classrooms/${encodeURIComponent(classroom.id)}/name`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(response.status < 500 && typeof body.detail === "string" ? body.detail
          : response.status === 422 && Array.isArray(body.detail) ? body.detail.map(item => item.msg).join(" ")
          : "Classroom name could not be updated. Please try again.");
        return;
      }
      onRenamed(body); onClose();
    } catch { setError("Classroom name could not be updated. Please try again."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="rename-class-title" className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl"
      onKeyDown={event => {
        if (event.key === "Escape" && !saving) onClose();
        if (event.key !== "Tab") return;
        const controls = [...dialog.current.querySelectorAll("input:not(:disabled), button:not(:disabled)")];
        const target = event.shiftKey ? controls.at(-1) : controls[0];
        if (!controls.length || document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
          event.preventDefault(); target?.focus();
        }
      }}>
      <h2 id="rename-class-title" className="text-lg font-semibold">Edit Classroom Name</h2>
      <ValidatedForm onSubmit={save} className="mt-4 space-y-4">
        <label className="block text-sm">Classroom name
          <ValidatedInput required validationLabel="Classroom name" value={name} disabled={saving}
            onChange={event => { setName(event.target.value); setError(""); }} className="mt-2 w-full rounded-lg border p-3" />
        </label>
        {error && <p role="alert" className="validation-error rounded-lg p-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="similarity-chip">Cancel</button>
          <button type="submit" disabled={saving || name.trim() === classroom.name} className="rounded-lg bg-[#137333] px-4 py-2 text-white disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </ValidatedForm>
    </section>
  </div>;
}
