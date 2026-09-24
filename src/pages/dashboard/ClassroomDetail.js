import { useState } from "react";
import ClassroomRoster from "./ClassroomRoster";
import { formatDateTime } from "./shared";

export default function ClassroomDetail({ classroom, assignments, teacher, onBack, onOpenAssignment, onCreateAssignment }) {
  const [tab, setTab] = useState("homework");
  const homework = assignments.filter((assignment) => assignment.classroomId === classroom.id);

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[#137333] hover:underline">← Back to classes</button>
      <div className={`rounded-xl p-6 text-white ${classroom.accent}`}>
        <h2 className="text-2xl font-medium break-words">{classroom.name}</h2>
        <p className="mt-2 text-sm">Section {classroom.section}</p>
        {classroom.subject && classroom.subject !== "No subject" && (
          <p className="mt-0.5 text-xs opacity-80">{classroom.subject}</p>
        )}
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
            {onCreateAssignment && <button type="button" onClick={onCreateAssignment} className="rounded-full bg-[#137333] px-4 py-2 text-sm text-white hover:bg-[#0f5b28]">Create assignment</button>}
          </div>
          {homework.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">No homework posted in this classroom yet.</p> : homework.map((assignment) => (
            <button type="button" key={assignment.id} onClick={() => onOpenAssignment(assignment)}
              className="block w-full rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-[#137333] hover:shadow-sm transition">
              <h4 className="font-medium break-words">{assignment.title}</h4>
              <p className="mt-2 text-sm text-gray-500">Due: {formatDateTime(assignment.dueDate)}</p>
              {assignment.instructions && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{assignment.instructions}</p>}
              <span className="mt-3 block text-sm font-medium text-[#137333]">Open homework →</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}


