import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { adminRequest } from "../apiFetch";
import { signOutAndExpireToken } from "../supabaseClient";
import ProfileEditor, { ProfileIcon } from "./dashboard/ProfileEditor";

const navigation = [["dashboard", "Dashboard"], ["users", "Users"], ["classes", "Classes"], ["activity-logs", "Activity Logs"], ["profile", "Admin Profile"]];
const control = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const action = "rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50";
const dateLabel = (value) => value ? new Date(value).toLocaleString() : "Not available";
const Status = ({ value }) => <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${value === "active" ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{value || "Not tracked"}</span>;

function Table({ headings, children }) {
  return <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{headings.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{children}</tbody></table></div>;
}
function Cell({ children }) { return <td className="px-4 py-3 align-top">{children}</td>; }
function Logs({ items }) {
  return <Table headings={["Date and time", "User", "Role", "Action", "Related record"]}>{items.map((row) => <tr key={row.id}><Cell>{dateLabel(row.created_at)}</Cell><Cell>{row.actor_name || "Unknown user"}</Cell><Cell>{row.actor_role || "Not available"}</Cell><Cell>{row.action}</Cell><Cell>{row.target_name || row.target_id || "—"}</Cell></tr>)}</Table>;
}

export default function AdminDashboard({ profile, onProfileUpdated }) {
  const location = useLocation();
  const page = location.pathname.split("/")[2] || "dashboard";
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const validPage = navigation.some(([key]) => key === page);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    setLoading(true);
    if (page === "profile" || !validPage) { setLoading(false); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search, role, status, date, page: String(pageNumber) });
        const result = await adminRequest(`${page}?${params}`);
        if (!cancelled) setData(result);
      } catch (err) { if (!cancelled) setError(err.message); }
      finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [page, validPage, search, role, status, date, pageNumber, reload]);

  function resetFilters() { setSearch(""); setRole("all"); setStatus("all"); setDate(""); setPageNumber(1); }
  async function view(record) {
    setDetailLoading(true); setError("");
    try { setDetail(await adminRequest(`${page}/${encodeURIComponent(record.id)}`)); }
    catch (err) { setError(err.message); }
    finally { setDetailLoading(false); }
  }
  async function changeStatus() {
    setSaving(true); setError(""); setNotice("");
    try {
      await adminRequest(`users/${encodeURIComponent(confirmation.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: confirmation.nextStatus }) });
      setNotice(`Account ${confirmation.nextStatus === "active" ? "reactivated" : "disabled"}.`);
      setConfirmation(null); setReload((n) => n + 1);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (!validPage || location.pathname === "/admin" || location.pathname === "/admin/") return <Navigate to="/admin/dashboard" replace />;
  const rows = data?.items || [];
  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202124]">
      <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-4 border-b border-[#dadce0] bg-white px-5 sm:px-8">
        <div><span className="text-2xl font-bold">WriteCheck</span><span className="ml-3 hidden text-sm text-emerald-700 sm:inline">Admin workspace</span></div>
        <div className="flex items-center gap-3"><button className={action} aria-label="Open admin profile" onClick={() => setEditing(true)}><ProfileIcon className="h-6 w-6" /></button><button className={action} onClick={() => signOutAndExpireToken("/login")}>Logout</button></div>
      </header>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:p-8">
        <aside className="shrink-0 lg:w-52"><nav aria-label="Admin navigation" className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3 lg:flex-col">
          {navigation.map(([key, label]) => <NavLink key={key} to={`/admin/${key}`} onClick={() => { resetFilters(); setDetail(null); setNotice(""); }} className={({ isActive }) => `rounded-lg px-4 py-3 text-base font-medium ${isActive ? "bg-emerald-50 text-emerald-800" : "text-gray-600 hover:bg-gray-50"}`}>{label}</NavLink>)}
        </nav></aside>
        <main className="min-w-0 flex-1 space-y-6">
          <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-emerald-700">System administration</p><h1 className="mt-1 text-3xl font-semibold">{navigation.find(([key]) => key === page)?.[1]}</h1></div><button className={action} disabled={loading} onClick={() => setReload(reload + 1)}>Refresh</button></div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
          {["users", "classes", "activity-logs"].includes(page) && <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">Search<input type="search" maxLength={200} value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} placeholder={page === "classes" ? "Class name or teacher" : page === "users" ? "Name or email" : "User, action, or related record"} className={control} /></label>
            {page !== "classes" && <label className="flex flex-col gap-1 text-sm">Role<select value={role} onChange={(e) => { setRole(e.target.value); setPageNumber(1); }} className={control}><option value="all">All roles</option><option value="student">Student</option><option value="teacher">Teacher</option>{page === "activity-logs" && <option value="admin">Admin</option>}</select></label>}
            {page === "users" && <label className="flex flex-col gap-1 text-sm">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1); }} className={control}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
            {page === "activity-logs" && <label className="flex flex-col gap-1 text-sm">Date (UTC)<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPageNumber(1); }} className={control} /></label>}
            <button className={`${action} self-end`} onClick={resetFilters}>Clear filters</button>
          </div>}
          {loading ? <p role="status" className="rounded-xl border bg-white p-8">Loading…</p> : <>
            {page === "dashboard" && data && <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[["students", "Total Students"], ["teachers", "Total Teachers"], ["classes", "Total Classes"], ["submissions", "Total Essay Submissions"], ["active", "Active Users"], ["inactive", "Inactive Users"]].map(([key, label]) => <article key={key} className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-600">{label}</p><p className="mt-3 text-3xl font-semibold text-emerald-800">{data[key]}</p></article>)}</div>
              <section className="space-y-3"><h2 className="text-xl font-semibold">Recent Registrations</h2>{data.recent_users.length ? <Table headings={["Name", "Email", "Role", "Date registered", "Status"]}>{data.recent_users.map((u) => <tr key={u.id}><Cell>{u.full_name}</Cell><Cell>{u.email}</Cell><Cell>{u.role}</Cell><Cell>{dateLabel(u.registered_at)}</Cell><Cell><Status value={u.account_status} /></Cell></tr>)}</Table> : <p className="text-sm text-gray-500">No registration dates available.</p>}</section>
              <section className="space-y-3"><h2 className="text-xl font-semibold">Recent System Activity</h2>{data.recent_activity.length ? <Logs items={data.recent_activity} /> : <p className="text-sm text-gray-500">No activity recorded yet.</p>}</section>
            </>}
            {page === "users" && rows.length > 0 && <Table headings={["Name", "Email", "Role", "Date registered", "Status", "Actions"]}>{rows.map((u) => <tr key={u.id}><Cell>{u.full_name}</Cell><Cell>{u.email}</Cell><Cell>{u.role}</Cell><Cell>{dateLabel(u.registered_at)}</Cell><Cell><Status value={u.account_status} /></Cell><Cell><div className="flex gap-2"><button disabled={detailLoading} className={action} onClick={() => view(u)}>View</button><button className={action} onClick={() => setConfirmation({ ...u, nextStatus: u.account_status === "active" ? "inactive" : "active" })}>{u.account_status === "active" ? "Disable" : "Reactivate"}</button></div></Cell></tr>)}</Table>}
            {page === "classes" && rows.length > 0 && <Table headings={["Class", "Code", "Teacher", "Students", "Activities", "Created", "Status", "Actions"]}>{rows.map((c) => <tr key={c.id}><Cell>{c.classroom_name}<p className="text-xs text-gray-500">{c.section}</p></Cell><Cell>{c.classroom_code}</Cell><Cell>{c.teacher_name || "Not available"}</Cell><Cell>{c.students}</Cell><Cell>{c.activities}</Cell><Cell>{dateLabel(c.created_at)}</Cell><Cell><Status value={c.status} /></Cell><Cell><button disabled={detailLoading} className={action} onClick={() => view(c)}>View class</button></Cell></tr>)}</Table>}
            {page === "activity-logs" && rows.length > 0 && <Logs items={rows} />}
            {data?.items && <><p className="text-sm text-gray-500">{data.total} matching records{rows.length === 0 ? ". No records to display." : ""}</p><div className="flex items-center gap-3"><button disabled={pageNumber === 1} className={action} onClick={() => setPageNumber(pageNumber - 1)}>Previous</button><span className="text-sm">Page {pageNumber}</span><button disabled={pageNumber * 25 >= data.total} className={action} onClick={() => setPageNumber(pageNumber + 1)}>Next</button></div></>}
            {page === "profile" && <section className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-6"><ProfileIcon className="h-16 w-16 text-emerald-700" /><h2 className="text-2xl font-semibold">{profile.full_name}</h2><p>{profile.email}</p><p>Role: Admin</p><p className="text-sm text-gray-600">Registered: {dateLabel(profile.registered_at)}</p><button className={action} onClick={() => setEditing(true)}>Edit profile</button></section>}
          </>}
        </main>
      </div>
      {editing && <ProfileEditor profile={profile} onSaved={onProfileUpdated} onClose={() => setEditing(false)} />}
      {detail && <AdminModal title={page === "classes" ? "Class details" : "User details"} onClose={() => setDetail(null)}>
        {page === "classes" ? <><h3 className="text-xl font-semibold">{detail.classroom_name}</h3><p>Code: {detail.classroom_code}</p><p>Teacher: {detail.teacher_name || "Not available"}</p><p>Section: {detail.section}</p><p>Created: {dateLabel(detail.created_at)}</p><p>{detail.students.length} students · {detail.activities} activities · {detail.submissions} submissions</p><h4 className="font-semibold">Enrolled students</h4>{detail.students.length ? <ul className="divide-y">{detail.students.map((s) => <li key={s.id} className="py-2">{s.full_name}<span className="block text-sm text-gray-500">{s.email}</span></li>)}</ul> : <p>No students enrolled.</p>}</> : <><h3 className="text-xl font-semibold">{detail.full_name}</h3><p>{detail.email}</p><p>Role: {detail.role}</p><p>Registered: {dateLabel(detail.registered_at)}</p><Status value={detail.account_status} />{detail.student_id && <p>Student ID: {detail.student_id}</p>}{detail.faculty_id && <p>Faculty ID: {detail.faculty_id}</p>}{detail.role === "student" ? <p>{detail.joined_classes} joined classes · {detail.submissions} submissions</p> : <p>{detail.created_classes} created classes · {detail.activities} activities</p>}</>}
      </AdminModal>}
      {confirmation && <AdminModal title="Confirm account status" onClose={() => { if (!saving) setConfirmation(null); }}><p>Are you sure you want to {confirmation.nextStatus === "inactive" ? "disable" : "reactivate"} this account?</p><p className="font-semibold">{confirmation.full_name} ({confirmation.email})</p>{confirmation.nextStatus === "inactive" && <p className="text-sm text-gray-600">Protected access will be blocked. Academic records will be retained.</p>}{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50" onClick={changeStatus}>{saving ? "Saving…" : "Confirm"}</button></AdminModal>}
    </div>
  );
}

function AdminModal({ title, children, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  function keys(event) {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const buttons = dialog.current.querySelectorAll('button:not(:disabled), a[href], input, select');
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"><section ref={dialog} tabIndex={-1} onKeyDown={keys} role="dialog" aria-modal="true" aria-label={title} className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl outline-none"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2><button className={action} onClick={onClose}>Close</button></div>{children}</section></div>;
}
