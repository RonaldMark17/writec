import { useState } from "react";
import ClassroomRoster from "./ClassroomRoster";
import { formatDateTime, ArchiveIcon, UnarchiveIcon, CopyIcon, DownloadIcon, LeaveIcon } from "./shared";

export default function ClassroomDetail({
  classroom,
  assignments,
  teacher,
  onBack,
  onOpenAssignment,
  onCreateAssignment,
  onToggleArchive,
  onCopyClassroom,
  onExportCSV,
  onLeaveClassroom,
}) {
  const [tab, setTab] = useState("homework");
  const homework = assignments.filter((assignment) => assignment.classroomId === classroom.id);
  const isArchived = Boolean(classroom.isArchived);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={onBack} className="text-sm font-medium text-[#137333] hover:underline">
          &larr; Back to classes
        </button>
        <div className="flex items-center gap-2">
          {onCopyClassroom && (
            <button
              type="button"
              onClick={() => onCopyClassroom(classroom)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
              title="Copy class for new term (duplicates assignments)"
            >
              <CopyIcon className="h-3.5 w-3.5 text-gray-500" />
              <span>Copy class</span>
            </button>
          )}
          {onExportCSV && isArchived && (
            <button
              type="button"
              onClick={() => onExportCSV(classroom)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
              title="Export class records to CSV"
            >
              <DownloadIcon className="h-3.5 w-3.5 text-gray-500" />
              <span>Export CSV</span>
            </button>
          )}
          {onToggleArchive && (
            <button
              type="button"
              onClick={() => onToggleArchive(classroom.id, !isArchived)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                isArchived
                  ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-red-700"
              }`}
            >
              {isArchived ? (
                <>
                  <UnarchiveIcon className="h-3.5 w-3.5" />
                  <span>Restore classroom</span>
                </>
              ) : (
                <>
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  <span>Archive classroom</span>
                </>
              )}
            </button>
          )}
          {onLeaveClassroom && (
            <button
              type="button"
              onClick={() => onLeaveClassroom(classroom)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition"
              title="Unenroll and leave this classroom"
            >
              <LeaveIcon className="h-3.5 w-3.5 text-gray-500 hover:text-red-600" />
              <span>Leave class</span>
            </button>
          )}
        </div>
      </div>

      {isArchived && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-800 shrink-0">
              <ArchiveIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">This classroom is archived</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {onToggleArchive
                  ? "This class is archived in read-only mode. Restore it to add new assignments or post announcements."
                  : "This class has been archived by your teacher. Submissions are closed, but your past papers, grades, and originality reports remain accessible for review."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onCopyClassroom && (
              <button
                type="button"
                onClick={() => onCopyClassroom(classroom)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100/70"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                <span>Copy for new term</span>
              </button>
            )}
            {onToggleArchive && (
              <button
                type="button"
                onClick={() => onToggleArchive(classroom.id, false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-800 shadow-2xs"
              >
                <UnarchiveIcon className="h-3.5 w-3.5" />
                <span>Restore to active</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`rounded-xl p-6 text-white ${classroom.accent}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-2xl font-medium break-words">{classroom.name}</h2>
            <p className="mt-2 text-sm">Section {classroom.section}</p>
            {classroom.subject && classroom.subject !== "No subject" && (
              <p className="mt-0.5 text-xs opacity-80">{classroom.subject}</p>
            )}
          </div>
          {isArchived && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white backdrop-blur-xs">
              Archived
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-b border-gray-200" aria-label="Classroom views">
        {[['homework', 'Homework'], ['people', 'People']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} aria-label={label === "People" ? "Members" : label} onClick={() => setTab(id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 ${tab === id ? 'border-[#137333] text-[#137333]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "people" ? (
        <section className="rounded-xl border border-[#dadce0] bg-white p-6" aria-label="Classroom people">
          <h3 className="mb-5 text-lg font-medium text-[#202124]">People</h3>
          <ClassroomRoster classroomId={classroom.id} teacher={teacher} />
        </section>
      ) : (
        <section className="space-y-4" aria-label="Classroom homework">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-medium">Homework ({homework.length})</h3>
            {onCreateAssignment && !isArchived && (
              <button type="button" onClick={onCreateAssignment} className="rounded-full bg-[#137333] px-4 py-2 text-sm text-white hover:bg-[#0f5b28]">
                Create assignment
              </button>
            )}
          </div>
          {homework.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              No homework posted in this classroom yet.
            </p>
          ) : (
            homework.map((assignment) => (
              <button type="button" key={assignment.id} onClick={() => onOpenAssignment(assignment)}
                className="block w-full rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-[#137333] hover:shadow-sm transition">
                <h4 className="font-medium break-words">{assignment.title}</h4>
                <p className="mt-2 text-sm text-gray-500">Due: {formatDateTime(assignment.dueDate)}</p>
                {assignment.instructions && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{assignment.instructions}</p>}
                <span className="mt-3 block text-sm font-medium text-[#137333]">Open homework &rarr;</span>
              </button>
            ))
          )}
        </section>
      )}
    </div>
  );
}
