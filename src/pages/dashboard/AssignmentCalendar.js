import { useState } from "react";

export function calendarDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function AssignmentCalendar({ assignments, classrooms, classroomId = "", onClassroomChange, onOpenAssignment }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const visible = assignments.filter(a => classroomId ? a.classroomId === classroomId : !a.isArchived);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - first.getDay() + 1));
  const today = calendarDateKey(new Date());
  const undated = visible.filter(a => !calendarDateKey(a.dueDate));
  const assignmentButton = a => <button key={a.id} type="button" onClick={() => onOpenAssignment(a)}
    className="block w-full rounded border border-emerald-200 bg-emerald-50 p-2 text-left text-xs text-emerald-900 hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-600">
    <span className="block font-semibold break-words">{a.title}</span>
    <span className="block">{a.classroomName}{a.classroomSection ? ` · ${a.classroomSection}` : ""}</span>
    {a.dueDate && <span className="block">{new Date(a.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
    {a.revisionRequest ? <span>Revision requested</span> : a.submitted ? <span>Turned In</span> : null}
  </button>;
  return <section aria-label="Assignment calendar" className="space-y-4">
    <h2 className="text-2xl font-medium">Assignment calendar</h2>
    <p className="text-sm text-gray-600">Deadlines are shown in your local time. Select an assignment to open it.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">Calendar classroom
        <select className="ml-2 rounded border p-2" value={classroomId} onChange={e => onClassroomChange(e.target.value)}>
          <option value="">All active classes</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` — Section ${c.section}` : ""}</option>)}
        </select>
      </label>
      <button type="button" aria-label="Previous month" className="rounded border px-3 py-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
      <h3 aria-live="polite" className="font-semibold">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h3>
      <button type="button" aria-label="Next month" className="rounded border px-3 py-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
      <button type="button" className="rounded border px-3 py-2" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
    </div>
    <div className="wc-calendar rounded-lg border bg-white">
      <div className="wc-calendar-grid grid grid-cols-7">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="wc-calendar-weekday border-b p-2 text-center text-sm font-semibold">{day}</div>)}
        {days.map(day => <section key={calendarDateKey(day)} aria-label={day.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })}
          data-has-work={visible.some(a => calendarDateKey(a.dueDate) === calendarDateKey(day))}
          data-current-month={day.getMonth() === month.getMonth()}
          className={`wc-calendar-day min-h-28 space-y-1 border-b border-r p-2 ${day.getMonth() === month.getMonth() ? "" : "bg-gray-50 text-gray-500"}`}>
          <time className="wc-agenda-date" dateTime={`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`}>{day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</time>
          <span aria-current={calendarDateKey(day) === today ? "date" : undefined} className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${calendarDateKey(day) === today ? "bg-emerald-700 text-white" : ""}`}>{day.getDate()}</span>
          {visible.filter(a => calendarDateKey(a.dueDate) === calendarDateKey(day)).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map(assignmentButton)}
        </section>)}
      </div>
    </div>
    {!visible.some(a => { const d = new Date(a.dueDate); return a.dueDate && d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); }) && <p>No deadlines this month.</p>}
    {undated.length > 0 && <section aria-label="Assignments without a deadline" className="space-y-2"><h3 className="font-semibold">No due date</h3>{undated.map(assignmentButton)}</section>}
  </section>;
}
