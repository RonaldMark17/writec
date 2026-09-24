import { apiFetch } from "../../apiFetch";
import { useState } from "react";
import ProfileEditor, { ProfileIcon } from "./ProfileEditor";
import { supabase, signOutAndExpireToken } from "../../supabaseClient";

export const CLASSROOM_TABLE = "classroomTable";
export const MEMBER_TABLE = "classroomMembers";
export const ASSIGNMENT_TABLE = "assignmentTable";
export const SUBMISSION_TABLE = "submissionTable";
export const ESSAY_BUCKET = "essay-submissions";

export function PlusIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function UploadIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8 12 3 7 8" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function ImageIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

export function UsersIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function DoorIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 21V5a2 2 0 0 1 2-2h10v18" />
      <path d="M16 3h2a2 2 0 0 1 2 2v16" />
      <path d="M12 12h.01" />
      <path d="M2 21h20" />
    </svg>
  );
}

export function FileSearchIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" />
      <path d="M14 2v6h6" />
      <path d="M10 13H8" />
      <path d="M10 17H8" />
      <circle cx="17" cy="17" r="3" />
      <path d="m21 21-1.9-1.9" />
    </svg>
  );
}

export function FileIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

export function ClipboardIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 18h6" />
      <path d="M9 10h1" />
    </svg>
  );
}

export function SparklesIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
    </svg>
  );
}

export function CheckIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CopyIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function DownloadIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ClockIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function AlertCircleIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function CalendarIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LogOutIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export const teacherPages = [
  {
    id: "classrooms",
    label: "Classes",
  },
  {
    id: "assignments",
    label: "Classwork",
  },
  {
    id: "submissions",
    label: "Grades",
  },
  {
    id: "upload",
    label: "Scan Station",
  },
];

export const studentPages = [
  {
    id: "classrooms",
    label: "Classes",
  },
  {
    id: "assignments",
    label: "To-do",
  },
  {
    id: "submissions",
    label: "Submissions",
  },
];

const classroomAccentClasses = [
  "bg-[#137333]", // Classic Classroom Green
  "bg-[#1967d2]", // Classic Classroom Blue
  "bg-[#b06000]", // Warm Ochre
  "bg-[#7627bb]", // Amethyst Purple
  "bg-[#007b83]", // Teal
  "bg-[#c5221f]", // Crimson Red
];

export const emptyClassroomForm = {
  name: "",
  section: "",
  subject: "",
};

export const emptyAssignmentForm = {
  classroomId: "",
  title: "",
  instructions: "",
  dueDate: "",
};

export const emptySubmissionForm = {
  assignmentId: "",
  essayTitle: "",
};

export function buildClassCode(name) {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = cleanName.slice(0, 4) || "CLAS";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `${prefix}${suffix}`;
}

export function formatDateTime(value) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function normalizeClassroom(row, index = 0, extra = {}) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.classroom_name || "Untitled classroom",
    section: row.section || "No section",
    subject: row.subject || "No subject",
    code: row.classroom_code,
    students: extra.students ?? 0,
    assignments: extra.assignments ?? 0,
    submissions: extra.submissions ?? 0,
    teacher: extra.teacher || "Teacher",
    accent: classroomAccentClasses[index % classroomAccentClasses.length],
  };
}

export function normalizeAssignment(row, classroomsById = new Map(), extra = {}) {
  const classroom =
    classroomsById.get(row.classroom_id);

  return {
    id: row.id,
    classroomId: row.classroom_id,
    teacherId: row.teacher_id,
    title: row.title || "Untitled assignment",
    instructions: row.instructions || "",
    dueDate: row.due_date,
    createdAt: row.created_at,
    classroomName: classroom?.name || "Classroom",
    classroomSection: classroom?.section || "",
    classroomSubject: classroom?.subject || "",
    classroomCode: classroom?.code || "",
    submissions: extra.submissions ?? 0,
    submitted: extra.submitted ?? false,
    submission: extra.submission ?? null,
  };
}

/**
 * Calculates due status, relative time, overdue flag, and approaching flag for an assignment.
 */
export function getAssignmentDueInfo(dueDate, submitted = false, referenceDate = new Date()) {
  if (submitted) {
    return {
      status: "submitted",
      label: "Turned in",
      isOverdue: false,
      isDueSoon: false,
      badgeColor: "bg-[#e6f4ea] text-[#137333] border-[#ceead6]",
      relativeText: "Submitted",
    };
  }

  if (!dueDate) {
    return {
      status: "no_due_date",
      label: "No due date",
      isOverdue: false,
      isDueSoon: false,
      badgeColor: "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]",
      relativeText: "No deadline",
    };
  }

  const due = new Date(dueDate);
  const now = new Date(referenceDate);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Overdue check
  if (diffMs < 0) {
    const overdueDays = Math.max(1, Math.floor(Math.abs(diffDays)));
    const overdueText = overdueDays === 1 ? "Overdue (1 day ago)" : `Overdue (${overdueDays} days ago)`;
    return {
      status: "overdue",
      label: "Overdue",
      isOverdue: true,
      isDueSoon: false,
      badgeColor: "bg-red-50 text-red-700 border-red-200",
      relativeText: overdueText,
      diffMs,
    };
  }

  // Approaching deadline (Due Soon: within 7 days)
  const isDueSoon = diffDays <= 7;
  let relativeText = "";
  if (diffHours <= 1) {
    relativeText = "Due in less than an hour";
  } else if (diffHours < 24) {
    const hours = Math.round(diffHours);
    relativeText = `Due in ${hours} hour${hours === 1 ? "" : "s"}`;
  } else if (diffDays <= 1.5) {
    relativeText = "Due tomorrow";
  } else {
    const days = Math.round(diffDays);
    relativeText = `Due in ${days} days`;
  }

  return {
    status: isDueSoon ? "due_soon" : "upcoming",
    label: isDueSoon ? "Due soon" : "Assigned",
    isOverdue: false,
    isDueSoon,
    badgeColor: isDueSoon
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-[#e8f0fe] text-[#1967d2] border-[#d2e3fc]",
    relativeText,
    diffMs,
  };
}

/**
 * Partitions and sorts assignments into Due Soon, To Do (unsubmitted), and Completed.
 * Strictly respects classroom/section filtering and sorts Due Soon by nearest deadline.
 */
export function filterAndSortTodoAssignments(
  assignments = [],
  selectedClassroomId = "",
  referenceDate = new Date()
) {
  const filtered = selectedClassroomId
    ? assignments.filter((a) => a.classroomId === selectedClassroomId)
    : assignments;

  // Unsubmitted assignments
  const todoList = filtered.filter((a) => !a.submitted);

  // Completed assignments
  const completedList = filtered.filter((a) => a.submitted);

  // Enrich with due info
  const enrichedTodo = todoList.map((a) => ({
    ...a,
    dueInfo: getAssignmentDueInfo(a.dueDate, false, referenceDate),
  }));

  // Due Soon: Unsubmitted assignments with a valid due date that is not past due, within approaching window (or all upcoming with due dates sorted nearest first)
  const dueSoonList = enrichedTodo
    .filter((a) => a.dueDate && !a.dueInfo.isOverdue)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Overdue list
  const overdueList = enrichedTodo
    .filter((a) => a.dueInfo.isOverdue)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // General To Do: All unsubmitted assignments (sorted: overdue first, then nearest due date, then no due date)
  const sortedTodoList = [...enrichedTodo].sort((a, b) => {
    if (a.dueInfo.isOverdue && !b.dueInfo.isOverdue) return -1;
    if (!a.dueInfo.isOverdue && b.dueInfo.isOverdue) return 1;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return {
    allCount: filtered.length,
    todoList: sortedTodoList,
    dueSoonList,
    overdueList,
    completedList,
  };
}

// In-memory cache for resolved blob URLs to prevent redundant network downloads
const blobUrlCache = new Map();

/**
 * Downloads a submission file directly from Supabase Storage as a native Blob.
 * Handles relative paths, folder structures, full URLs, and backend fallbacks.
 */
export async function downloadSubmissionFileBlob(fileUrl) {
  if (!fileUrl) throw new Error("No file path provided.");

  // 1. If already a Blob or Data URI, convert directly
  if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
    const res = await apiFetch(fileUrl);
    return await res.blob();
  }

  const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

  // 2. If it is already a direct backend URL, fetch from backend immediately (fastest & bypasses Supabase 400)
  if (fileUrl.startsWith(backendUrl) || /^https?:\/\/[^/]+:(?:8000|5000)\/uploads/i.test(fileUrl)) {
    try {
      const res = await apiFetch(fileUrl);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 0) return b;
      }
    } catch {
      // continue to fallback resolution
    }
  }

  // 3. Clean storage path
  let cleanPath = fileUrl;
  if (/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public\/|sign\/)?essay-submissions\//i.test(fileUrl)) {
    cleanPath = fileUrl.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public\/|sign\/)?essay-submissions\//i, "").split("?")[0];
  } else if (/^https?:\/\/[^/]+\/uploads\/(?:submissions\/)?/i.test(fileUrl)) {
    cleanPath = fileUrl.replace(/^https?:\/\/[^/]+\/uploads\/(?:submissions\/)?/i, "").split("?")[0];
  }

  cleanPath = cleanPath.replace(/^\/?essay-submissions\//, "").replace(/^\/+/, "");
  const filename = cleanPath.split("/").pop();

  // 4. Primary: Try direct Supabase Storage SDK download (bypasses browser CORS restrictions)
  try {
    const { data: blob, error } = await supabase.storage.from(ESSAY_BUCKET).download(cleanPath);
    if (!error && blob && blob.size > 0) {
      return blob;
    }
  } catch {
    // continue
  }

  // 5. If path was just a filename (e.g. 1789...jpg), search recursively in Supabase storage
  if (filename && !cleanPath.includes("/")) {
    try {
      const { data: topFolders } = await supabase.storage.from(ESSAY_BUCKET).list();
      if (topFolders && topFolders.length > 0) {
        for (const tf of topFolders) {
          if (!tf.id) {
            const { data: subFolders } = await supabase.storage.from(ESSAY_BUCKET).list(tf.name);
            if (subFolders) {
              for (const sf of subFolders) {
                const subPath = `${tf.name}/${sf.name}`;
                const { data: files } = await supabase.storage.from(ESSAY_BUCKET).list(subPath);
                const found = (files || []).find(f => f.name === filename);
                if (found) {
                  const exactPath = `${subPath}/${filename}`;
                  const { data: foundBlob } = await supabase.storage.from(ESSAY_BUCKET).download(exactPath);
                  if (foundBlob && foundBlob.size > 0) return foundBlob;
                }
              }
            }
          }
        }
      }
    } catch {
      // continue
    }
  }

  // 6. Try local backend uploads server and backend storage proxy
  const backendCandidates = [
    `${backendUrl}/uploads/submissions/${filename || cleanPath}`,
    `${backendUrl}/uploads/${filename || cleanPath}`,
    `${backendUrl}/api/storage/file?path=${encodeURIComponent(cleanPath)}`,
  ];

  for (const bUrl of backendCandidates) {
    try {
      const res = await apiFetch(bUrl);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 0) return b;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Could not fetch submission image for path: ${fileUrl}`);
}

/**
 * Resolves a reliable, browser-renderable image preview URL for any submission.
 * Prioritizes native Supabase Storage blobs (CORS-immune, persistent, zero token expiry).
 */
export async function resolveStorageImageUrl(fileUrl) {
  if (!fileUrl) return "";

  if (blobUrlCache.has(fileUrl)) {
    return blobUrlCache.get(fileUrl);
  }

  const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

  // If already a backend URL, it is immediately renderable by the browser
  if (fileUrl.startsWith(backendUrl) || /^https?:\/\/[^/]+:(?:8000|5000)\/uploads/i.test(fileUrl)) {
    const response = await apiFetch(fileUrl);
    if (!response.ok) throw new Error("Unable to load the submission image.");
    const url = URL.createObjectURL(await response.blob());
    blobUrlCache.set(fileUrl, url);
    return url;
  }

  try {
    const blob = await downloadSubmissionFileBlob(fileUrl);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(fileUrl, blobUrl);
      return blobUrl;
    }
  } catch (err) {
    console.warn("[resolveStorageImageUrl] direct blob retrieval notice:", err?.message || err);
  }

  // Safe fallback to local backend server instead of invalid Supabase public URL (avoids 400 NoSuchKey errors)
  let cleanPath = fileUrl.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public\/|sign\/)?essay-submissions\//i, "").split("?")[0];
  cleanPath = cleanPath.replace(/^\/?essay-submissions\//, "").replace(/^\/+/, "");
  const filename = cleanPath.split("/").pop();

  return `${backendUrl}/uploads/submissions/${filename || cleanPath}`;
}

export async function openSubmissionFile(filePath, onError) {
  if (!filePath) {
    if (onError) onError("No file attached to this submission.");
    return;
  }

  try {
    const blob = await downloadSubmissionFileBlob(filePath);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      return;
    }
  } catch (err) {
    console.warn("[openSubmissionFile] blob open failed, falling back:", err);
  }

  // Fallback to signed URL or public URL
  let cleanPath = filePath.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public\/|sign\/)?essay-submissions\//i, "").split("?")[0];
  cleanPath = cleanPath.replace(/^\/?essay-submissions\//, "").replace(/^\/+/, "");

  try {
    const { data } = await supabase.storage.from(ESSAY_BUCKET).createSignedUrl(cleanPath, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const { data: pubData } = supabase.storage.from(ESSAY_BUCKET).getPublicUrl(cleanPath);
    if (pubData?.publicUrl) {
      window.open(pubData.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }
  } catch (err) {
    if (onError) onError(err.message || "Failed to open submission file.");
  }
}

export function StatusMessage({ error, message }) {
  return (
    <>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      )}
    </>
  );
}

function PageNav({ pages, activePage, onChange, label }) {
  return (
    <nav
      className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar"
      aria-label={label}
    >
      {pages.map((page) => {
        const isActive =
          page.id === activePage;

        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onChange(page.id)}
            className={
              isActive
                ? "relative border-b-2 border-[#137333] shrink-0 px-4 py-5 text-base font-semibold text-[#137333] transition-colors"
                : "border-b-2 border-transparent shrink-0 px-4 py-5 text-base font-medium text-[#5f6368] transition-colors hover:bg-[#f1f3f4] hover:text-[#202124] rounded-t-md"
            }
            aria-current={isActive ? "page" : undefined}
          >
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}

export function Header({ workspace, pages, activePage, onPageChange, profile, onProfileUpdated }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const handleLogout = async () => {
    await signOutAndExpireToken("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#dadce0] bg-white shadow-2xs">
      <div className="mx-auto flex min-h-[88px] max-w-[1440px] flex-wrap items-center justify-between gap-x-3 px-4 sm:px-6 lg:flex-nowrap">
        {/* Brand Left */}
        <div className="flex items-center gap-3 py-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#137333] text-white shadow-2xs">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <polyline points="10 2 10 10 13 7 16 10 16 2" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#202124]">WriteCheck</span>
            <span className="text-xs font-medium text-[#5f6368] hidden sm:inline">Classroom</span>
          </div>
        </div>

        {/* Center Nav */}
        <div className="order-3 flex w-full min-w-0 justify-center lg:order-none lg:w-auto lg:flex-1 lg:px-3">
          <PageNav
            pages={pages}
            activePage={activePage}
            onChange={onPageChange}
            label={`${workspace} navigation`}
          />
        </div>

        {editingProfile && profile && <ProfileEditor profile={profile} onSaved={onProfileUpdated} onClose={() => setEditingProfile(false)} />}
        {/* Right Actions */}
        <div className="flex items-center gap-2.5 py-2.5">
          {profile && <button type="button" aria-label="Open profile" aria-haspopup="dialog" aria-expanded={editingProfile} title={profile.full_name || "Your profile"} onClick={() => setEditingProfile(true)} className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[#137333] transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"><ProfileIcon className="h-7 w-7" /></button>}
          <span className="hidden xl:inline-flex items-center rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-semibold text-[#137333]">
            {workspace}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] px-3 py-2.5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-gray-400"
            title="Sign out of account"
          >
            <LogOutIcon className="h-3.5 w-3.5 text-[#5f6368]" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function EditIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function toDateTimeLocalInput(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const offsetMs = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offsetMs);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
