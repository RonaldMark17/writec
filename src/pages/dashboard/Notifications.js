import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import Pagination from "./Pagination";
import "./notifications.css";

const categories = { Comments: ["student_class_comment", "student_private_comment"], Assignments: ["assignment_created", "assignment_updated", "resubmission_requested"], Submissions: ["submission_created", "submission_resubmitted"], "Grades / Feedback": ["grade_posted", "feedback_added"] };
const labels = {
  student_class_comment: "Class Comment", student_private_comment: "Private Comment",
  assignment_created: "New assignment", assignment_updated: "Assignment updated",
  resubmission_requested: "Resubmission requested", grade_posted: "Grade / feedback",
  feedback_added: "Feedback", submission_created: "Submission", submission_resubmitted: "Resubmission",
};
const columns = "id,type,title,message,classroom_id,assignment_id,submission_id,metadata,is_read,created_at";

export function useNotifications(userId) {
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const [countError, setCountError] = useState(false);
  const generation = useRef(0);
  const cancelPendingCount = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++generation.current;
    try {
      const { count, error } = await supabase.from("notifications")
        .select("id", { count: "exact", head: true }).eq("recipient_user_id", userId).eq("is_read", false);
      if (error) throw error;
      if (request === generation.current) { setUnread(count || 0); setCountError(false); }
    } catch { if (request === generation.current) setCountError(true); }
  }, [userId]);
  const invalidate = useCallback(() => { setVersion(v => v + 1); return refresh(); }, [refresh]);
  useEffect(() => {
    setUnread(0);
    refresh();
    const visibleRefresh = () => { if (document.visibilityState !== "hidden") invalidate(); };
    const timer = window.setInterval(visibleRefresh, 30000);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      cancelPendingCount();
      window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [refresh, invalidate, cancelPendingCount]);
  const markRead = useCallback(async (id = null) => {
    const { error } = await supabase.rpc("mark_notifications_read", { notification_key: id });
    if (error) throw new Error("Could not mark notifications as read. Please retry.");
    await invalidate();
  }, [invalidate]);
  return { userId, unread, countError, version, refresh, markRead };
}

function useNotificationList(model, filter, page, pageSize, category) {
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  const identity = `${model.userId}:${filter}:${category}:${page}:${pageSize}`;
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: "" }));
    async function load() {
      try {
        let query = supabase.from("notifications").select(columns, { count: "exact" }).eq("recipient_user_id", model.userId);
        if (categories[category]) query = query.in("type", categories[category]);
        if (filter !== "all") query = query.eq("is_read", filter === "read");
        const { data, count, error } = await query.order("created_at", { ascending: false })
          .order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
        if (error) throw error;
        if (!cancelled) setState({ rows: data || [], total: count || 0, loading: false, error: "", identity });
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: "Notifications could not be loaded." }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [model.userId, model.version, filter, page, pageSize, category, retry, identity]);
  return { ...state, rows: state.identity === identity ? state.rows : [], retry: () => setRetry(v => v + 1) };
}

export function relativeNotificationTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  if (minutes < 2880) return "Yesterday";
  return new Date(value).toLocaleDateString();
}

function EmptyState({ filtered }) {
  return <div className="notification-empty"><p>{filtered ? "No matching notifications" : "No notifications yet"}</p>
    <p>Important classroom updates will appear here.</p></div>;
}

function NotificationList({ model, onOpen, compact = false }) {
  const [category, setCategory] = useState("All");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useNotificationList(model, filter, page, compact ? 5 : 20, category);
  const pageCount = Math.max(1, Math.ceil(list.total / 20));
  useEffect(() => { if (!list.loading && !list.error && page > pageCount) setPage(pageCount); }, [list.loading, list.error, page, pageCount]);
  async function perform(action) {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await action(); } catch (error) { setActionError(error.message || "Could not open this notification. Please retry."); }
    finally { setBusy(false); }
  }
  const open = row => perform(async () => {
    // Resolve access and fresh destination data before acknowledging the event.
    const navigate = await onOpen(row);
    if (!row.is_read) await model.markRead(row.id);
    navigate();
  });
  return <div className="notification-content" aria-busy={busy}>
    <div className="notification-heading"><h2>{compact ? "Recent notifications" : "Notifications"}</h2>
      <button type="button" disabled={busy || !model.unread} onClick={() => perform(() => model.markRead())}>Mark all as read</button></div>
    {!compact && <div className="notification-filters" aria-label="Notification status filters">
      {["all", "unread", "read"].map(value => <button type="button" key={value} aria-pressed={filter === value}
        onClick={() => { setFilter(value); setPage(1); }}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>}
    {!compact && <div className="notification-filters" aria-label="Notification categories">
      {["All", ...Object.keys(categories)].map(value => <button type="button" key={value} aria-pressed={category === value}
        onClick={() => { setCategory(value); setPage(1); }}>{value === "All" ? "All categories" : value}</button>)}
    </div>}
    {actionError && <p role="alert">{actionError}</p>}
    {list.error && <p role="alert">{list.error} <button type="button" onClick={list.retry}>Retry</button></p>}
    {list.loading && !list.rows.length && <p role="status">Loading notifications…</p>}
    {!list.loading && !list.error && !list.rows.length && <EmptyState filtered={filter !== "all"} />}
    {compact ? <ul className="notification-recent">{list.rows.map(row => <li key={row.id} data-unread={!row.is_read}>
      <button type="button" disabled={busy} onClick={() => open(row)}>
        <strong>{row.title}</strong>{row.type.startsWith("student_") && <span>{labels[row.type]}</span>}<span>{row.message}</span><span>{row.metadata?.classroom_name} · {relativeNotificationTime(row.created_at)}</span>
        {!row.is_read && <span className="notification-status">● Unread</span>}
      </button></li>)}</ul> : <>
      {!!list.rows.length && <table className="notification-table"><thead><tr>
        {["Type", "Classroom", "Notification", "Date/Time", "Status", "Action"].map(label => <th key={label} scope="col">{label}</th>)}
      </tr></thead><tbody>{list.rows.map(row => <tr key={row.id} data-unread={!row.is_read}>
        <td data-label="Type">{labels[row.type] || row.type}</td>
        <td data-label="Classroom">{row.metadata?.classroom_name || "Classroom"}</td>
        <td data-label="Notification"><strong>{row.title}</strong><p>{row.message}</p>
          {row.metadata?.due_date && <p>Due: {new Date(row.metadata.due_date).toLocaleString()}</p>}</td>
        <td data-label="Date/Time"><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></td>
        <td data-label="Status">{row.is_read ? "Read" : "● Unread"}</td>
        <td data-label="Action"><button type="button" disabled={busy} onClick={() => open(row)}>
          {row.type.startsWith("student_") ? "View comments" : row.type.startsWith("submission_") ? "Review submission" : row.type === "grade_posted" || row.type === "feedback_added" ? "View feedback / grade" : "View assignment"}
        </button></td>
      </tr>)}</tbody></table>}
      <Pagination label="Notifications" pagination={{ page, pageCount, setPage }} />
    </>}
  </div>;
}

export function NotificationBell({ model, onOpen, onViewAll }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const bell = useRef(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector(".notification-panel button:not(:disabled)")?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === "Escape") { setOpen(false); bell.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className="notification-root" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={bell} type="button" className="notification-bell" aria-label={`Notifications${model.unread ? `, ${model.unread} unread` : ""}`}
      aria-expanded={open} aria-controls="notification-panel" onClick={() => { setOpen(!open); model.refresh(); }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {model.unread > 0 && <span className="notification-badge" aria-hidden="true">{model.unread > 9 ? "9+" : model.unread}</span>}
    </button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Notifications">
      {model.countError && <p role="status">Unread count could not be refreshed.</p>}
      <NotificationList compact model={model} onOpen={async row => {
        const navigate = await onOpen(row);
        return () => { navigate(); setOpen(false); };
      }} />
      <button type="button" className="notification-view-all" onClick={() => { setOpen(false); onViewAll(); }}>View all notifications</button>
    </section>}
  </div>;
}

export function NotificationsPage({ model, onOpen }) {
  return <section className="notifications-page" aria-label="Notifications"><NotificationList model={model} onOpen={onOpen} /></section>;
}
