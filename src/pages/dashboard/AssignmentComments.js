import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { formatDateTime } from "./shared";

export default function AssignmentComments({ assignmentId, classroomId, profile }) {
  const [comments, setComments] = useState([]);
  const [roster, setRoster] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [drafts, setDrafts] = useState({ class: "", private: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const teacher = profile?.role === "teacher";
  useEffect(() => {
    setRecipient(""); setDrafts({ class: "", private: "" });
  }, [assignmentId, classroomId, profile?.id]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setComments([]);
    async function load() {
      try {
        const results = await Promise.all([
          supabase.rpc("list_assignment_comments", { requested_assignment_id: String(assignmentId), requested_classroom_id: String(classroomId) }),
          teacher ? supabase.rpc("get_classroom_roster", { requested_classroom_id: String(classroomId) }) : Promise.resolve({ data: [] }),
        ]);
        for (const result of results) if (result.error) throw result.error;
        if (!cancelled) { setComments(results[0].data || []); setRoster(results[1].data || []); }
      } catch (error) { if (!cancelled) setError(error.message || "Unable to load comments."); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [assignmentId, classroomId, teacher, attempt]);

  async function submit(event, kind) {
    event.preventDefault();
    if (saving || !drafts[kind].trim() || (teacher && !recipient)) return;
    setSaving(kind); setError("");
    try {
      const { error } = await supabase.rpc("post_assignment_comment", {
        requested_assignment_id: String(assignmentId), requested_classroom_id: String(classroomId),
        comment_text: drafts[kind].trim(), comment_kind: kind,
        recipient_student_id: teacher ? recipient : null,
      });
      if (error) throw error;
      setDrafts((current) => ({ ...current, [kind]: "" }));
      setAttempt((value) => value + 1);
    } catch (error) { setError(error.message || "Unable to post comment."); }
    finally { setSaving(""); }
  }
  // Include historical conversation names, even when a student has since left.
  const recipients = new Map(roster.map((row) => [row.student_id, row.student_name]));
  comments.filter((row) => row.visibility === "private").forEach((row) => {
    if (!recipients.has(row.student_id)) recipients.set(row.student_id, row.recipient_name || "Student");
  });
  return <div aria-label="Assignment comments" className="mt-5 space-y-5">
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)} className="underline">Retry</button></p>}
    {["class", "private"].map((kind) => {
      const title = kind === "class" ? "Class Comments" : "Private Comments";
      const rows = comments.filter((row) => (row.visibility || "private") === kind &&
        (kind === "class" || !teacher || row.student_id === recipient));
      const canPost = profile?.role === "student" || (teacher && kind === "private" && roster.some((r) => r.student_id === recipient));
      return <section key={kind} aria-label={title} className="space-y-4 rounded-xl border border-[#dadce0] bg-white p-5">
        <h3 className="font-medium text-[#202124]">{title}</h3>
        <p className="text-xs text-gray-500">{kind === "class" ? "Visible to enrolled classmates and the classroom teacher." : "Visible only to the student in this conversation and the classroom teacher."}</p>
        {teacher && kind === "private" && <label className="block text-sm">Student conversation
          <select value={recipient} onChange={(event) => { setRecipient(event.target.value); setDrafts((d) => ({ ...d, private: "" })); }} className="ml-2 rounded-lg border p-2">
            <option value="">Select a student</option>
            {[...recipients].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>}
        {loading ? <p role="status" className="text-sm text-gray-500">Loading comments...</p> :
          !error && (teacher && kind === "private" && !recipient ? <p className="text-sm text-gray-500">Select a student to view or reply privately.</p> :
          rows.length === 0 ? <p className="text-sm text-gray-500">No comments yet.</p> :
          <ul className="divide-y divide-gray-100">{rows.map((comment) => <li key={comment.id} className="py-3">
            <p className="text-sm font-medium">{comment.sender_name || comment.student_name}</p>
            <time className="text-xs text-gray-500" dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.comment_text}</p>
          </li>)}</ul>)}
        {canPost && <form onSubmit={(event) => submit(event, kind)} className="space-y-3">
          <label className="block text-sm">{kind === "class" ? "Class Comment" : "Private Comment"}
            <textarea value={drafts[kind]} onChange={(event) => setDrafts((current) => ({ ...current, [kind]: event.target.value }))}
              required maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-[#dadce0] p-3 text-sm focus:border-[#137333]" />
          </label>
          <button type="submit" disabled={Boolean(saving) || loading || !drafts[kind].trim()} className="rounded-full bg-[#137333] px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving === kind ? "Posting..." : kind === "class" ? "Post class comment" : teacher ? "Reply privately" : "Post private comment"}
          </button>
        </form>}
      </section>;
    })}
  </div>;
}
