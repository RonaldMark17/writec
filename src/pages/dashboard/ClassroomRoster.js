import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { MEMBER_TABLE, getTeacherAvatarTheme, isCustomAvatarUrl } from "./shared";

/* ─── Helpers ──────────────────────────────────────────────── */
function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name.slice(0, 2) || "??").toUpperCase();
}

function Avatar({ id, name, size = "h-10 w-10", text = "text-sm", avatarUrl = "", avatarColor = "" }) {
  const [hasError, setHasError] = useState(false);
  if (isCustomAvatarUrl(avatarUrl) && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setHasError(true)}
        className={`${size} shrink-0 rounded-full object-cover select-none ring-2 ring-white`}
      />
    );
  }
  const theme = getTeacherAvatarTheme(id, avatarColor);
  return (
    <div
      className={`${size} bg-gradient-to-tr ${theme.bg} ${text} flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none shadow-xs`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

function PersonRow({ id, name, email, badge, badgeColor, avatarUrl, avatarColor }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar id={id} name={name} avatarUrl={avatarUrl} avatarColor={avatarColor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#202124]">{name}</p>
        {email && <p className="truncate text-xs text-[#5f6368]">{email}</p>}
      </div>
      {badge && (
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionHeading({ icon, title, count }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#dadce0] pb-2">
      <span className="text-[#137333]">{icon}</span>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-[#5f6368]">{title}</h4>
      {count != null && (
        <span className="ml-auto rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#137333]">
          {count}
        </span>
      )}
    </div>
  );
}

const TeacherIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422A12.083 12.083 0 0121 13c0 5.523-4.477 10-9 10S3 18.523 3 13c0-.57.052-1.127.15-1.667L9 14z" />
  </svg>
);

const StudentsIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

export default function ClassroomRoster({ classroomId, teacher }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Fallback to resolve teacher details if incomplete
  const resolvedTeacher = (() => {
    if (!teacher) return null;
    let cached = null;
    if ((!teacher.name || teacher.name === "Teacher" || !teacher.email) && teacher.id) {
      try {
        const s = localStorage.getItem(`writecheck_teacher_${teacher.id}`) || localStorage.getItem(`writecheck_profile_prefs_${teacher.id}`);
        if (s) cached = JSON.parse(s);
      } catch {}
    }
    return {
      id: teacher.id,
      name: (teacher.name && teacher.name !== "Teacher") ? teacher.name : (cached?.name || cached?.full_name || teacher.name || "Teacher"),
      email: teacher.email || cached?.email || "",
      avatarUrl: teacher.avatarUrl || cached?.avatarUrl || "",
      avatarColor: teacher.avatarColor || cached?.avatarColor || "",
    };
  })();

  useEffect(() => {
    if (!classroomId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setStudents([]);

    async function load() {
      try {
        let roster = [];
        let rpcFailed = false;
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc("get_classroom_roster", {
            requested_classroom_id: String(classroomId),
          });
          if (rpcErr) throw rpcErr;
          if (Array.isArray(rpcData) && rpcData.length > 0) {
            roster = rpcData.map((r) => ({
              id: r.student_id,
              name: r.student_name || "Student",
              email: "",
            }));
          }
        } catch {
          rpcFailed = true;
        }

        // 2. Fetch member rows & userTable to enrich details
        const { data: memberRows, error: memberErr } = await supabase
          .from(MEMBER_TABLE)
          .select("id, student_id")
          .eq("classroom_id", classroomId);

        if (memberErr && rpcFailed) throw memberErr;

        if (memberRows?.length) {
          const studentIds = memberRows.map((m) => m.student_id).filter(Boolean);
          try {
            const { data: userRows } = await supabase
              .from("userTable")
              .select("id, full_name, email")
              .in("id", studentIds);

            const usersById = new Map((userRows ?? []).map((u) => [u.id, u]));

            if (roster.length === 0) {
              roster = memberRows.map((m) => {
                const user = usersById.get(m.student_id) || {};
                return {
                  id: m.student_id,
                  name: user.full_name || user.email || "Student",
                  email: user.email || "",
                };
              });
            } else {
              roster = roster.map((item) => {
                const user = usersById.get(item.id);
                return {
                  ...item,
                  name: (user?.full_name && user.full_name !== "Student") ? user.full_name : item.name,
                  email: user?.email || item.email || "",
                };
              });
            }
          } catch {
            if (roster.length === 0) {
              roster = memberRows.map((m) => ({
                id: m.student_id,
                name: "Student",
                email: "",
              }));
            }
          }
        }

        roster.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setStudents(roster);
      } catch {
        if (!cancelled) setError("Unable to load class members. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [classroomId, attempt]);

  return (
    <div className="space-y-7">
      {/* ── Teacher section ── */}
      <div>
        <SectionHeading icon={<TeacherIcon />} title="Teacher" />
        <div className="divide-y divide-[#f1f3f4]">
          {resolvedTeacher ? (
            <PersonRow
              id={resolvedTeacher.id || "teacher"}
              name={resolvedTeacher.name || "Teacher"}
              email={resolvedTeacher.email || ""}
              avatarUrl={resolvedTeacher.avatarUrl}
              avatarColor={resolvedTeacher.avatarColor}
              badge="Teacher"
              badgeColor="bg-[#e6f4ea] text-[#137333]"
            />
          ) : (
            <p className="py-3 text-sm text-[#5f6368]">Teacher info unavailable.</p>
          )}
        </div>
      </div>

      {/* ── Students section ── */}
      <div>
        <SectionHeading
          icon={<StudentsIcon />}
          title="Students"
          count={loading ? null : students.length}
        />

        {loading ? (
          <div className="mt-3 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-[#f1f3f4]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[#f1f3f4]" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-[#f1f3f4]" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              className="mt-2 font-medium underline"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry
            </button>
          </div>
        ) : students.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#dadce0] bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f3f4] text-[#5f6368]">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-[#202124]">No students enrolled yet</p>
            <p className="mt-1 text-xs text-[#5f6368]">Share the class code so students can join.</p>
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-[#f1f3f4]" aria-label="Student list">
            {students.map((s, i) => (
              <li key={s.id}>
                <PersonRow
                  id={s.id}
                  name={s.name}
                  email={s.email}
                  badge={`${i + 1}`}
                  badgeColor="bg-[#f1f3f4] text-[#5f6368]"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


