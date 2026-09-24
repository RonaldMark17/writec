import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export default function ClassroomRoster({ classroomId, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setStudents([]);
    async function load() {
      try {
        const { data, error: loadError } = await supabase.rpc("get_classroom_roster", {
          requested_classroom_id: String(classroomId),
        });
        if (loadError) throw loadError;
        if (!cancelled) setStudents(data || []);
      } catch {
        if (!cancelled) setError("Unable to load students. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, classroomId, attempt]);

  return (
    <div className="mt-4 border-t border-[#dadce0] pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="text-sm font-medium text-[#137333] hover:underline">
        {open ? "Hide students" : "View students"}
      </button>
      {open && (
        <div className="mt-3" aria-live="polite">
          {loading ? <p className="text-sm text-gray-500">Loading students…</p> : error ? (
            <div role="alert" className="text-sm text-red-700">
              <p>{error}</p>
              <button type="button" className="mt-2 underline" onClick={() => setAttempt(attempt + 1)}>Retry</button>
            </div>
          ) : (
            <>
              <h4 className="text-sm font-medium">Students ({students.length})</h4>
              {students.length === 0 ? <p className="mt-2 text-sm text-gray-500">No students enrolled yet.</p> : (
                <ul className="mt-2 max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {students.map((student) => (
                    <li key={student.student_id} className="py-2 text-sm text-[#3c4043] break-words">
                      {student.student_name}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
