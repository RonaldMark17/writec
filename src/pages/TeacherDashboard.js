import { processingLabel, useSubmissionProgress } from "./dashboard/submissionProgress";
import { apiFetch, getBackendUrl } from "../apiFetch";
import ClassroomDetail from "./dashboard/ClassroomDetail";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../supabaseClient";
import {
  ASSIGNMENT_TABLE,
  CLASSROOM_TABLE,
  MEMBER_TABLE,
  ClipboardIcon,
  SUBMISSION_TABLE,
  ESSAY_BUCKET,
  resolveStorageImageUrl,
  DoorIcon,
  FileIcon,
  FileSearchIcon,
  Header,
  ImageIcon,
  PlusIcon,
  StatusMessage,
  UploadIcon,
  UsersIcon,
  SparklesIcon,
  CheckIcon,
  CopyIcon,
  ChevronDownIcon,
  buildClassCode,
  emptyAssignmentForm,
  emptyClassroomForm,
  formatDateTime,
  normalizeAssignment,
  normalizeClassroom,
  downloadSubmissionFileBlob,
  openSubmissionFile,
  teacherPages,
  EditIcon,
  toDateTimeLocalInput,
  ArrowLeftIcon,
  SearchIcon,
  ExternalLinkIcon,
  DownloadIcon,
  getInitials,
  getTeacherAvatarTheme,
  ArchiveIcon,
  UnarchiveIcon,
} from "./dashboard/shared";
import HighlightedText from "./HighlightedText";
import {
  ACCEPTED_CHECK_FILE_TYPES,
  analyzePlagiarismInput,
  checkPlagiarismViaBackend,
  fetchUserPlagiarismScans,
  formatFileSize,
  getFileKind,
  pollPlagiarismScanResult,
  readTextFromFiles,
} from "./dashboard/plagiarismScan";
import {
  extractTextFromImage,
  getOcrEngineInfo,
} from "./dashboard/ocrService";

const uploadModes = [
  {
    id: "picture",
    label: "Picture",
    icon: ImageIcon,
  },
  {
    id: "file",
    label: "File",
    icon: FileIcon,
  },
  {
    id: "text",
    label: "Paste",
    icon: ClipboardIcon,
  },
];

function getTeacherActivePage(profileId) {
  if (!profileId || typeof window === "undefined") return "classrooms";

  const savedPage = window.sessionStorage.getItem(
    `writecheck-teacher-active-page-${profileId}`
  );

  return teacherPages.some((page) => page.id === savedPage)
    ? savedPage
    : "classrooms";
}

export default function TeacherDashboard({ profile, onProfileUpdated }) {
  const [openedClassroomId, setOpenedClassroomId] = useState(null);

  const [activePage, setActivePage] =
    useState(() => getTeacherActivePage(profile?.id));

  const [classrooms, setClassrooms] =
    useState([]);
  const [classroomTab, setClassroomTabState] = useState(() => {
    if (typeof window !== "undefined") {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab === "active" || urlTab === "archived") return urlTab;
      try {
        const saved = sessionStorage.getItem(`writecheck-classroom-tab-${profile?.id || "teacher"}`);
        if (saved === "active" || saved === "archived") return saved;
      } catch {}
    }
    return "active";
  });

  const setClassroomTab = useCallback((tab) => {
    setClassroomTabState(tab);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`writecheck-classroom-tab-${profile?.id || "teacher"}`, tab);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      } catch {}
    }
  }, [profile?.id]);
  const [archivingClassroom, setArchivingClassroom] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [copyingClassroom, setCopyingClassroom] = useState(null);
  const [copyForm, setCopyForm] = useState({ name: "", section: "", subject: "" });
  const [isCopying, setIsCopying] = useState(false);

  const [assignments, setAssignments] =
    useState([]);

  const [submissions, setSubmissions] =
    useState([]);

  const [selectedClassroomId, setSelectedClassroomId] =
    useState("");

  const [classroomForm, setClassroomForm] =
    useState(emptyClassroomForm);

  const [assignmentForm, setAssignmentForm] =
    useState(emptyAssignmentForm);

  const [editingAssignment, setEditingAssignment] = useState(null);
  const [isUpdatingAssignment, setIsUpdatingAssignment] = useState(false);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [assignmentDetailTab, setAssignmentDetailTab] = useState("roster");
  const teacherDataRequestRef = useRef(0);

  const [classroomMembers, setClassroomMembers] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [assignmentFilterClassroomId, setAssignmentFilterClassroomId] = useState("all");
  const [submissionRosterFilter, setSubmissionRosterFilter] = useState("all");
  const [submissionRosterSearch, setSubmissionRosterSearch] = useState("");
  const [selectedSubmissionsClassroomId, setSelectedSubmissionsClassroomId] = useState("all");
  const [selectedSubmissionsAssignmentId, setSelectedSubmissionsAssignmentId] = useState("all");
  const [gradeSubject, setGradeSubject] = useState("all");
  const [submissionHubSearch, setSubmissionHubSearch] = useState("");
  const [submissionHubClassroomId, setSubmissionHubClassroomId] = useState("all");
  const [submissionHubFilter, setSubmissionHubFilter] = useState("all");
  const [submissionHubSort, setSubmissionHubSort] = useState("newest");
  const [scanRosterFilter, setScanRosterFilter] = useState("all");
  const [scanRosterSearch, setScanRosterSearch] = useState("");
  const [loadedSubmissionInfo, setLoadedSubmissionInfo] = useState(null);
  const [loadingSubmissionId, setLoadingSubmissionId] = useState(null);

  const [uploadMode, setUploadMode] =
    useState("");

  const [manualCheckTitle, setManualCheckTitle] =
    useState("");

  const [manualCheckText, setManualCheckText] =
    useState("");

  const [manualCheckFiles, setManualCheckFiles] =
    useState([]);

  const [manualImagePreview, setManualImagePreview] =
    useState("");

  const [manualCheckResult, setManualCheckResult] =
    useState(null);

  const [plagiarismScanProgressText, setPlagiarismScanProgressText] =
    useState("");

  const [reviewingSubmission, setReviewingSubmission] =
    useState(null);

  const [gradeInput, setGradeInput] =
    useState("");

  const [feedbackInput, setFeedbackInput] =
    useState("");

  const [isSavingGrade, setIsSavingGrade] =
    useState(false);

  const [reviewScanResult, setReviewScanResult] =
    useState(null);

  const [reviewTranscribedText, setReviewTranscribedText] =
    useState("");

  const [isReviewScanning, setIsReviewScanning] =
    useState(false);

  const [reviewScanProgressText, setReviewScanProgressText] =
    useState("");

  const [reviewCopySuccess, setReviewCopySuccess] =
    useState(false);

  const [reviewImagePreviewUrl, setReviewImagePreviewUrl] =
    useState("");

  const [isLoadingImagePreview, setIsLoadingImagePreview] =
    useState(false);

  const [isImageExpanded, setIsImageExpanded] =
    useState(false);

  const [isManualImageExpanded, setIsManualImageExpanded] =
    useState(false);

  const [manualLiveOcrResult, setManualLiveOcrResult] =
    useState(null);

  const [ocrEngineInfo, setOcrEngineInfo] =
    useState(null);

  const [isTranscribing, setIsTranscribing] =
    useState(false);

  const [transcribedText, setTranscribedText] =
    useState("");

  const [transcriptionResult, setTranscriptionResult] =
    useState(null);

  const [showLineBreakdown, setShowLineBreakdown] =
    useState(false);

  const [copySuccess, setCopySuccess] =
    useState(false);

  const [isEditingTranscript, setIsEditingTranscript] =
    useState(false);

  const [manualCheckError, setManualCheckError] =
    useState("");

  const manualCheckImageUrl = useMemo(() => {
    if (manualImagePreview) return manualImagePreview;
    if (manualCheckResult?.imageUrl) return manualCheckResult.imageUrl;

    const candidateFile = manualCheckFiles?.find((f) => f.type?.startsWith("image/"));
    if (candidateFile) {
      try {
        return URL.createObjectURL(candidateFile);
      } catch {
        // ignore
      }
    }

    const candidateName =
      manualCheckFiles?.[0]?.name ||
      manualCheckResult?.imageName ||
      manualCheckResult?.extractedImages?.[0]?.fileName ||
      (manualCheckTitle && /\.(jpe?g|png|webp|gif)$/i.test(manualCheckTitle) ? manualCheckTitle : null);

    if (candidateName && /\.(jpe?g|png|webp|gif)$/i.test(candidateName)) {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
      return `${backendUrl}/uploads/${candidateName}`;
    }

    return "";
  }, [manualImagePreview, manualCheckResult, manualCheckFiles, manualCheckTitle]);

  const [isCreatingClassroom, setIsCreatingClassroom] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSavingClassroom, setIsSavingClassroom] =
    useState(false);

  const [isSavingAssignment, setIsSavingAssignment] =
    useState(false);

  const [isScanningManualCheck, setIsScanningManualCheck] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    if (!successMessage && !errorMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage("");
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage, errorMessage]);

  useEffect(() => {
    setSuccessMessage("");
    setErrorMessage("");
  }, [activePage]);

  useEffect(() => {
    if (!profile?.id || typeof window === "undefined") return;

    window.sessionStorage.setItem(
      `writecheck-teacher-active-page-${profile.id}`,
      activePage
    );
  }, [activePage, profile?.id]);

  const activeClassrooms = useMemo(
    () => classrooms.filter((classroom) => !classroom.isArchived),
    [classrooms]
  );
  const archivedClassrooms = useMemo(
    () => classrooms.filter((classroom) => Boolean(classroom.isArchived)),
    [classrooms]
  );
  const visibleClassrooms = classroomTab === "active" ? activeClassrooms : archivedClassrooms;

  const selectedClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    activeClassrooms[0] ??
    classrooms[0] ??
    {
      id: "",
      name: "No classroom yet",
      section: "Create a classroom to get started",
      subject: "",
      code: "------",
      students: 0,
      assignments: 0,
      submissions: 0,
      accent: "bg-emerald-700",
    };

  const selectedAssignment = useMemo(() => {
    return assignments.find((a) => a.id === selectedAssignmentId) || null;
  }, [assignments, selectedAssignmentId]);

  const assignmentRoster = useMemo(() => {
    if (!selectedAssignment) return [];

    const enrolledMembers = classroomMembers.filter(
      (m) => m.classroomId === selectedAssignment.classroomId
    );

    const assignmentSubmissions = submissions.filter(
      (s) =>
        s.assignmentId === selectedAssignment.id &&
        s.classroomId === selectedAssignment.classroomId
    );

    const submissionByStudentId = new Map(
      assignmentSubmissions.map((s) => [s.studentId, s])
    );

    const enrolledStudentIds = new Set(enrolledMembers.map((m) => m.studentId));
    const roster = enrolledMembers.map((member) => {
      const sub = submissionByStudentId.get(member.studentId);
      const isSubmitted = Boolean(sub);
      const isGraded = Boolean(sub?.grade);

      let status = "missing";
      if (isGraded) {
        status = "graded";
      } else if (isSubmitted) {
        if (
          selectedAssignment.dueDate &&
          new Date(sub.createdAt) > new Date(selectedAssignment.dueDate)
        ) {
          status = "late";
        } else {
          status = "submitted";
        }
      }

      return {
        studentId: member.studentId,
        studentName: member.studentName || "Student",
        studentEmail: member.studentEmail || "",
        submission: sub || null,
        isSubmitted,
        status,
        fileUrl: sub?.fileUrl || null,
        essayTitle: sub?.essayTitle || "",
        grade: sub?.grade || "",
        feedback: sub?.feedback || "",
        submittedAt: sub?.createdAt || null,
      };
    });

    for (const sub of assignmentSubmissions) {
      if (!enrolledStudentIds.has(sub.studentId)) {
        const isGraded = Boolean(sub.grade);
        let status = "missing";
        if (isGraded) {
          status = "graded";
        } else {
          if (
            selectedAssignment.dueDate &&
            new Date(sub.createdAt) > new Date(selectedAssignment.dueDate)
          ) {
            status = "late";
          } else {
            status = "submitted";
          }
        }
        roster.push({
          studentId: sub.studentId,
          studentName: sub.studentName || "Student",
          studentEmail: "",
          submission: sub,
          isSubmitted: true,
          status,
          fileUrl: sub.fileUrl || null,
          essayTitle: sub.essayTitle || "",
          grade: sub.grade || "",
          feedback: sub.feedback || "",
          submittedAt: sub.createdAt || null,
        });
      }
    }

    return roster;
  }, [selectedAssignment, classroomMembers, submissions]);

  const filteredAssignmentRoster = useMemo(() => {
    let list = assignmentRoster;

    if (submissionRosterFilter === "submitted") {
      list = list.filter((item) => item.isSubmitted);
    } else if (submissionRosterFilter === "graded") {
      list = list.filter((item) => Boolean(item.grade));
    } else if (submissionRosterFilter === "missing") {
      list = list.filter((item) => !item.isSubmitted);
    }

    const term = submissionRosterSearch.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (item) =>
          item.studentName.toLowerCase().includes(term) ||
          item.studentEmail.toLowerCase().includes(term) ||
          item.essayTitle.toLowerCase().includes(term)
      );
    }

    return list;
  }, [assignmentRoster, submissionRosterFilter, submissionRosterSearch]);

  const assignmentStats = useMemo(() => {
    const total = assignmentRoster.length;
    const submitted = assignmentRoster.filter((r) => r.isSubmitted).length;
    const graded = assignmentRoster.filter((r) => Boolean(r.grade)).length;
    const missing = total - submitted;

    return {
      total,
      submitted,
      graded,
      missing,
    };
  }, [assignmentRoster]);

  const filteredAssignments = useMemo(() => {
    if (assignmentFilterClassroomId === "all") return assignments;
    return assignments.filter((a) => a.classroomId === assignmentFilterClassroomId);
  }, [assignments, assignmentFilterClassroomId]);

  const gradeSubjects = [...new Set(classrooms.map((c) => c.subject && c.subject !== "No subject" ? c.subject : c.name))].sort();
  const gradeClasswork = assignments.filter((assignment) => {
    const classroom = classrooms.find((c) => c.id === assignment.classroomId);
    const subject = classroom?.subject && classroom.subject !== "No subject" ? classroom.subject : classroom?.name;
    return (gradeSubject === "all" || subject === gradeSubject) &&
      (selectedSubmissionsClassroomId === "all" || String(assignment.classroomId) === String(selectedSubmissionsClassroomId));
  });

  const submissionHubGroups = useMemo(() => {
    const term = submissionHubSearch.trim().toLowerCase();
    const now = new Date();
    const dueSoonLimit = new Date(now);
    dueSoonLimit.setDate(dueSoonLimit.getDate() + 7);

    const enriched = assignments
      .map((assignment) => {
        // Counts are intentionally computed from this assignment's own classroom.
        // This keeps submissions and missing students isolated by section.
        const enrolledStudentIds = new Set(
          classroomMembers
            .filter((member) => member.classroomId === assignment.classroomId)
            .map((member) => member.studentId)
        );
        const assignmentSubmissions = submissions.filter(
          (submission) =>
            submission.assignmentId === assignment.id &&
            submission.classroomId === assignment.classroomId &&
            enrolledStudentIds.has(submission.studentId)
        );
        const submittedStudentIds = new Set(
          assignmentSubmissions.map((submission) => submission.studentId)
        );
        const latestSubmissionAt = assignmentSubmissions.reduce((latest, submission) => {
          const submittedAt = new Date(submission.createdAt || 0).getTime();
          return Math.max(latest, Number.isNaN(submittedAt) ? 0 : submittedAt);
        }, 0);

        return {
          ...assignment,
          submissionStats: {
            submitted: submittedStudentIds.size,
            missing: Math.max(0, enrolledStudentIds.size - submittedStudentIds.size),
            latestSubmissionAt,
          },
        };
      })
      .filter((assignment) => {
        if (activePage === "submissions") {
          const subject = assignment.classroomSubject && assignment.classroomSubject !== "No subject" ? assignment.classroomSubject : assignment.classroomName;
          return (gradeSubject === "all" || subject === gradeSubject) &&
            (selectedSubmissionsClassroomId === "all" || String(assignment.classroomId) === String(selectedSubmissionsClassroomId)) &&
            (selectedSubmissionsAssignmentId === "all" || String(assignment.id) === String(selectedSubmissionsAssignmentId));
        }
        const searchable = [
          assignment.title,
          assignment.classroomName,
          assignment.classroomSubject,
          assignment.classroomSection,
        ].join(" ").toLowerCase();
        if (term && !searchable.includes(term)) return false;
        if (submissionHubClassroomId !== "all" && assignment.classroomId !== submissionHubClassroomId) return false;

        if (submissionHubFilter === "dueSoon") {
          if (!assignment.dueDate) return false;
          const due = new Date(assignment.dueDate);
          return due >= now && due <= dueSoonLimit;
        }
        if (submissionHubFilter === "noDueDate") return !assignment.dueDate;
        if (submissionHubFilter === "submitted") return assignment.submissionStats.submitted > 0;
        if (submissionHubFilter === "notSubmitted") return assignment.submissionStats.submitted === 0;
        return true;
      })
      .sort((a, b) => {
        if (submissionHubSort === "oldest") {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (submissionHubSort === "dueDate") {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        }
        if (submissionHubSort === "recentSubmissions") {
          return b.submissionStats.latestSubmissionAt - a.submissionStats.latestSubmissionAt;
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });

    return enriched.reduce((groups, assignment) => {
      const group = groups.get(assignment.classroomId) || {
        id: assignment.classroomId,
        name: assignment.classroomName,
        section: assignment.classroomSection,
        subject: assignment.classroomSubject,
        assignments: [],
      };
      group.assignments.push(assignment);
      groups.set(assignment.classroomId, group);
      return groups;
    }, new Map());
  }, [
    assignments,
    classroomMembers,
    submissions,
    activePage,
    gradeSubject,
    selectedSubmissionsClassroomId,
    selectedSubmissionsAssignmentId,
    submissionHubClassroomId,
    submissionHubFilter,
    submissionHubSearch,
    submissionHubSort,
  ]);

  const scanStationAssignments = useMemo(() => {
    const term = submissionHubSearch.trim().toLowerCase();
    return assignments
      .filter((assignment) => {
        if (submissionHubClassroomId !== "all" && String(assignment.classroomId) !== String(submissionHubClassroomId)) {
          return false;
        }
        if (term) {
          const haystack = [
            assignment.title,
            assignment.classroomName,
            assignment.classroomSubject,
            assignment.classroomSection,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (submissionHubSort === "oldest") {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (submissionHubSort === "dueDate") {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        }
        if (submissionHubSort === "title") {
          return (a.title || "").localeCompare(b.title || "");
        }
        if (submissionHubSort === "recentSubmissions") {
          return (b.submissions || 0) - (a.submissions || 0);
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [assignments, submissionHubClassroomId, submissionHubSearch, submissionHubSort]);

  const selectedScanAssignment = useMemo(() => {
    if (!submissionHubFilter || submissionHubFilter === "all" || ["dueSoon", "noDueDate", "submitted", "notSubmitted"].includes(submissionHubFilter)) {
      return null;
    }
    return assignments.find((a) => String(a.id) === String(submissionHubFilter)) || null;
  }, [assignments, submissionHubFilter]);

  const selectedScanRoster = useMemo(() => {
    if (!selectedScanAssignment) return [];
    const assignmentId = String(selectedScanAssignment.id);
    const classroomId = String(selectedScanAssignment.classroomId);

    const enrolledMembers = classroomMembers.filter(
      (member) => String(member.classroomId) === classroomId
    );

    const assignmentSubmissions = submissions.filter(
      (sub) =>
        String(sub.assignmentId || sub.assignment_id) === assignmentId &&
        String(sub.classroomId || sub.classroom_id) === classroomId
    );

    const submissionByStudentId = new Map(
      assignmentSubmissions.map((s) => [String(s.studentId || s.student_id), s])
    );

    const enrolledIds = new Set(enrolledMembers.map((m) => String(m.studentId)));

    const roster = enrolledMembers.map((member) => {
      const sub = submissionByStudentId.get(String(member.studentId));
      const isSubmitted = Boolean(sub);
      const isGraded = Boolean(sub?.grade);

      let status = "missing";
      if (isGraded) {
        status = "graded";
      } else if (isSubmitted) {
        if (
          selectedScanAssignment.dueDate &&
          new Date(sub.createdAt) > new Date(selectedScanAssignment.dueDate)
        ) {
          status = "late";
        } else {
          status = "submitted";
        }
      }

      return {
        studentId: member.studentId,
        studentName: member.studentName || "Student",
        studentEmail: member.studentEmail || "",
        submission: sub || null,
        isSubmitted,
        isGraded,
        status,
        fileUrl: sub?.fileUrl || null,
        essayTitle: sub?.essayTitle || "",
        grade: sub?.grade || "",
        feedback: sub?.feedback || "",
        submittedAt: sub?.createdAt || null,
        scanResult: sub?.scanResult || null,
        transcribedText: sub?.transcribedText || "",
      };
    });

    for (const sub of assignmentSubmissions) {
      const sId = String(sub.studentId || sub.student_id);
      if (!enrolledIds.has(sId)) {
        const isGraded = Boolean(sub?.grade);
        roster.push({
          studentId: sId,
          studentName: sub.studentName || "Student",
          studentEmail: "",
          submission: sub,
          isSubmitted: true,
          isGraded,
          status: isGraded ? "graded" : "submitted",
          fileUrl: sub?.fileUrl || null,
          essayTitle: sub?.essayTitle || "",
          grade: sub?.grade || "",
          feedback: sub?.feedback || "",
          submittedAt: sub?.createdAt || null,
          scanResult: sub?.scanResult || null,
          transcribedText: sub?.transcribedText || "",
        });
      }
    }

    return roster;
  }, [selectedScanAssignment, classroomMembers, submissions]);

  const filteredScanRoster = useMemo(() => {
    let list = selectedScanRoster;
    if (scanRosterFilter === "submitted") {
      list = list.filter((r) => r.isSubmitted && !r.isGraded);
    } else if (scanRosterFilter === "graded") {
      list = list.filter((r) => r.isGraded);
    } else if (scanRosterFilter === "missing") {
      list = list.filter((r) => !r.isSubmitted);
    }

    const term = scanRosterSearch.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.studentName.toLowerCase().includes(term) ||
          r.studentEmail.toLowerCase().includes(term) ||
          (r.essayTitle && r.essayTitle.toLowerCase().includes(term))
      );
    }

    return list;
  }, [selectedScanRoster, scanRosterFilter, scanRosterSearch]);

  const submissionSyncError = useSubmissionProgress(profile?.id, setSubmissions, true);

  const loadTeacherData = useCallback(async (silent = false) => {
    const teacherId = profile?.id;
    if (!teacherId) return false;

    const requestId = teacherDataRequestRef.current + 1;
    teacherDataRequestRef.current = requestId;
    if (!silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    let classroomRows = [];
    let classroomError = null;

    const resWithArchived = await supabase
      .from(CLASSROOM_TABLE)
      .select("id, created_at, teacher_id, classroom_name, classroom_code, subject, section, teacher_name, is_archived")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (resWithArchived.error) {
      const resFallback = await supabase
        .from(CLASSROOM_TABLE)
        .select("id, created_at, teacher_id, classroom_name, classroom_code, subject, section, teacher_name")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });
      classroomRows = resFallback.data;
      classroomError = resFallback.error;
    } else {
      classroomRows = resWithArchived.data;
      classroomError = resWithArchived.error;
    }

    if (classroomError) {
      setErrorMessage(classroomError.message);
      setIsLoading(false);
      return false;
    }

    const cachedArchivedSet = new Set();
    try {
      const storedKeys = [
        `writecheck_archived_classes_${teacherId}`,
        "writecheck_archived_classes_teacher",
      ];
      storedKeys.forEach((key) => {
        const stored = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(stored)) {
          stored.forEach((id) => cachedArchivedSet.add(String(id)));
        }
      });
    } catch {}

    // Query backend for archived classrooms (authoritative service-role check from DB)
    let backendArchivedIds = null;
    try {
      const backendUrl = getBackendUrl();
      const archResp = await apiFetch(`${backendUrl}/api/classrooms/archived`);
      if (archResp && archResp.ok) {
        const archData = await archResp.json();
        if (archData?.success && Array.isArray(archData?.archived_ids)) {
          backendArchivedIds = new Set(archData.archived_ids.map(String));
        }
      }
    } catch {}

    if (profile?.id) {
      try {
        localStorage.setItem(`writecheck_teacher_${profile.id}`, JSON.stringify({
          id: profile.id,
          name: profile.full_name || profile.email || "Teacher",
          email: profile.email || "",
          avatarColor: profile.avatarColor || "amber",
          avatarUrl: profile.avatarUrl || "",
        }));
      } catch {}

      const missingTeacherName = (classroomRows ?? []).filter(
        (c) => c.teacher_id === profile.id && (!c.teacher_name || c.teacher_name !== profile.full_name)
      );
      if (missingTeacherName.length > 0 && profile.full_name) {
        supabase
          .from(CLASSROOM_TABLE)
          .update({ teacher_name: profile.full_name })
          .in("id", missingTeacherName.map((c) => c.id))
          .then(() => {});
      }
    }

    const classIds =
      (classroomRows ?? []).map((classroom) => classroom.id);

    let memberRows = [];
    let assignmentRows = [];
    let submissionRows = [];
    let studentRows = [];
    const rosterNames = new Map();

    if (classIds.length > 0) {
      const rosters = await Promise.all(classIds.map(async (classroomId) => {
        const { data, error } = await supabase.rpc("get_classroom_roster", {
          requested_classroom_id: String(classroomId),
        });
        return { classroomId, data, error };
      }));
      if (requestId !== teacherDataRequestRef.current) return false;
      const rosterError = rosters.find((roster) => roster.error)?.error;
      if (rosterError) {
        setErrorMessage(`Could not load enrolled student names: ${rosterError.message}`);
        setIsLoading(false);
        return false;
      }
      memberRows = rosters.flatMap(({ classroomId, data }) => (data ?? []).map((student) => {
        rosterNames.set(student.student_id, student.student_name);
        return {
          id: `${classroomId}:${student.student_id}`,
          classroom_id: classroomId,
          student_id: student.student_id,
        };
      }));
    }

    let { data: assignmentsData, error: assignmentError } =
      await supabase
        .from(ASSIGNMENT_TABLE)
        .select("id, created_at, classroom_id, teacher_id, title, instructions, due_date, accept_late_submissions")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

    if (assignmentError && (assignmentError.message?.includes("accept_late_submissions") || assignmentError.code === "42703" || assignmentError.code === "PGRST204")) {
      const fallback = await supabase
        .from(ASSIGNMENT_TABLE)
        .select("id, created_at, classroom_id, teacher_id, title, instructions, due_date")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });
      assignmentsData = fallback.data;
      assignmentError = fallback.error;
    }

    if (assignmentError) {
      setErrorMessage(assignmentError.message);
      setIsLoading(false);
      return false;
    }

    assignmentRows =
      assignmentsData ?? [];

    const assignmentIds =
      assignmentRows.map((assignment) => assignment.id);

    if (assignmentIds.length > 0) {
      const { data: submissionsData, error: submissionError } =
        await supabase
          .from(SUBMISSION_TABLE)
          .select("*")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false });

      if (submissionError) {
        setErrorMessage(submissionError.message);
        setIsLoading(false);
        return false;
      }

      submissionRows =
        submissionsData ?? [];
    }

    const studentIdsFromMembers = memberRows.map((member) => member.student_id).filter(Boolean);
    const studentIdsFromSubmissions = submissionRows.map((submission) => submission.student_id).filter(Boolean);
    const studentIds =
      [...new Set([...studentIdsFromMembers, ...studentIdsFromSubmissions])];

    if (studentIds.length > 0) {
      const { data: users } =
        await supabase
          .from("userTable")
          .select("id, full_name, email")
          .in("id", studentIds);

      studentRows =
        users ?? [];
    }

    const memberCountByClass =
      memberRows.reduce((counts, member) => {
        counts[member.classroom_id] =
          (counts[member.classroom_id] ?? 0) + 1;
        return counts;
      }, {});

    const assignmentCountByClass =
      assignmentRows.reduce((counts, assignment) => {
        counts[assignment.classroom_id] =
          (counts[assignment.classroom_id] ?? 0) + 1;
        return counts;
      }, {});

    const submissionCountByClass =
      submissionRows.reduce((counts, submission) => {
        counts[submission.classroom_id] =
          (counts[submission.classroom_id] ?? 0) + 1;
        return counts;
      }, {});

    const nextClassrooms =
      (classroomRows ?? []).map((classroom, index) => {
        const classIdStr = String(classroom.id);
        let isArchived = false;

        // Authoritative resolution:
        // 1. Authoritative check from backend service role DB query:
        if (backendArchivedIds !== null) {
          isArchived = backendArchivedIds.has(classIdStr);
        }
        // 2. Direct database column value if returned by Supabase query:
        else if (typeof classroom.is_archived === "boolean") {
          isArchived = classroom.is_archived;
        }
        // 3. Fallback to cached set only if database column was missing:
        else {
          isArchived = cachedArchivedSet.has(classIdStr);
        }

        // Keep local cache strictly in sync with authoritative database value:
        if (isArchived) {
          cachedArchivedSet.add(classIdStr);
        } else {
          cachedArchivedSet.delete(classIdStr);
        }

        return normalizeClassroom(classroom, index, {
          students: memberCountByClass[classroom.id] ?? 0,
          assignments: assignmentCountByClass[classroom.id] ?? 0,
          submissions: submissionCountByClass[classroom.id] ?? 0,
          isArchived,
        });
      });

    try {
      const storageKeys = [
        `writecheck_archived_classes_${teacherId}`,
        "writecheck_archived_classes_teacher",
        "writecheck_archived_classes_global",
      ];
      storageKeys.forEach((key) => {
        localStorage.setItem(key, JSON.stringify(Array.from(cachedArchivedSet)));
      });
    } catch {}

    const classroomsById =
      new Map(nextClassrooms.map((classroom) => [classroom.id, classroom]));

    const submissionCountByAssignment =
      submissionRows.reduce((counts, submission) => {
        counts[submission.assignment_id] =
          (counts[submission.assignment_id] ?? 0) + 1;
        return counts;
      }, {});

    const nextAssignments =
      assignmentRows.map((assignment) =>
        normalizeAssignment(assignment, classroomsById, {
          submissions: submissionCountByAssignment[assignment.id] ?? 0,
        })
      );

    const studentsById =
      new Map(
        studentRows.map((student) => [
          student.id,
          student.full_name || student.email || "Student",
        ])
      );

    rosterNames.forEach((name, studentId) => {
      studentsById.set(studentId, name);
    });

    const assignmentsById =
      new Map(nextAssignments.map((assignment) => [assignment.id, assignment]));

    let localGradesMap = {};
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
      const res = await apiFetch(`${backendUrl}/api/submissions/grades`);
      if (res.ok) {
        localGradesMap = await res.json();
      }
    } catch {
      // Ignore network errors fetching grades
    }

    const nextSubmissions =
      submissionRows.map((submission) => {
        const assignment =
          assignmentsById.get(submission.assignment_id);
        const gradeInfo = localGradesMap[submission.id] || {};

        return {
          id: submission.id,
          createdAt: submission.created_at,
          assignmentId: submission.assignment_id,
          classroomId: submission.classroom_id,
          studentId: submission.student_id,
          returnedAt: submission.returned_at,
          studentName: studentsById.get(submission.student_id) || "Student",
          assignmentTitle: assignment?.title || "Assignment",
          classroomName: assignment?.classroomName || "Classroom",
          essayTitle: submission.essay_title || "Essay submission",
          fileUrl: submission.file_url,
          status: submission.status || gradeInfo.status || "submitted",
          grade: submission.grade ?? gradeInfo.grade ?? "",
          feedback: submission.feedback ?? gradeInfo.feedback ?? "",
          transcribedText: submission.transcribed_text ?? gradeInfo.transcribed_text ?? "",
          scanResult: submission.scan_result ?? gradeInfo.scan_result ?? null,
        };
      });

    const usersById = new Map(studentRows.map((user) => [user.id, user]));
    const nextClassroomMembers = memberRows.map((member) => {
      const user = usersById.get(member.student_id);
      return {
        id: member.id,
        classroomId: member.classroom_id,
        studentId: member.student_id,
        studentName: studentsById.get(member.student_id) || "Student",
        studentEmail: user?.email || "",
      };
    });

    if (requestId !== teacherDataRequestRef.current) {
      return false;
    }

    setClassroomMembers(nextClassroomMembers);
    setClassrooms(nextClassrooms);
    setAssignments(nextAssignments);
    setSubmissions(nextSubmissions);
    setSelectedAssignmentId((currentId) =>
      currentId && nextAssignments.some((a) => a.id === currentId)
        ? currentId
        : null
    );
    setSelectedClassroomId((currentId) =>
      nextClassrooms.some((classroom) => classroom.id === currentId)
        ? currentId
        : nextClassrooms[0]?.id ?? ""
    );
    setAssignmentForm((currentForm) => ({
      ...currentForm,
      classroomId:
        nextClassrooms.some((classroom) => classroom.id === currentForm.classroomId)
          ? currentForm.classroomId
          : nextClassrooms[0]?.id ?? "",
    }));
    setIsLoading(false);
    return true;
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      loadTeacherData();
    }
  }, [profile?.id, loadTeacherData]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not refetch on TOKEN_REFRESHED (which fires on tab switch / window focus)
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (session?.user?.id) {
          loadTeacherData();
        }
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadTeacherData]);

  useEffect(() => {
    const imageFile =
      manualCheckFiles.find((file) => file.type?.startsWith("image/"));

    if (!imageFile) {
      setManualImagePreview("");
      return undefined;
    }

    const previewUrl =
      URL.createObjectURL(imageFile);

    setManualImagePreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [manualCheckFiles]);

  useEffect(() => {
    let isMounted = true;
    getOcrEngineInfo().then((info) => {
      if (isMounted && info) {
        setOcrEngineInfo(info);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleArchiveClassroom = async (classroomId, archive = true) => {
    if (!classroomId) return;
    setIsArchiving(true);
    setErrorMessage("");
    const classIdStr = String(classroomId);

    // Save snapshot of previous state for reliable rollback on failure
    const previousClassrooms = classrooms;
    const previousTab = classroomTab;

    try {
      // 1. Optimistically update local state so UI is immediately responsive
      setClassrooms((prev) =>
        prev.map((c) =>
          String(c.id) === classIdStr ? { ...c, isArchived: archive } : c
        )
      );

      // When restoring, switch immediately to "active" tab so the user sees the restored class
      if (!archive) {
        setClassroomTab("active");
      }

      // 2. Persist to backend service role endpoint (guaranteed to persist is_archived in Supabase Postgres)
      let backendUpdated = false;
      let failureReason = "";

      try {
        const backendUrl = getBackendUrl();
        const response = await apiFetch(`${backendUrl}/api/classrooms/${classroomId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_archived: archive }),
        });
        const resBody = await response.json().catch(() => ({}));
        if (response.ok && resBody?.success) {
          backendUpdated = true;
        } else {
          failureReason =
            resBody?.detail ||
            resBody?.message ||
            resBody?.error ||
            `Server responded with HTTP ${response.status}`;
          console.warn("Backend archive response not ok:", response.status, resBody);
        }
      } catch (backendErr) {
        failureReason = backendErr.message || "Unable to reach backend server";
        console.warn("Backend archive call failed, trying direct Supabase:", backendErr);
      }

      // 3. Fallback: Try direct Supabase RPC archive_classroom (SECURITY DEFINER with teacher ownership check)
      if (!backendUpdated) {
        try {
          const { data: rpcSuccess, error: rpcErr } = await supabase.rpc("archive_classroom", {
            target_classroom_id: classroomId,
            should_archive: archive,
          });
          if (!rpcErr && rpcSuccess === true) {
            backendUpdated = true;
          } else if (rpcErr) {
            console.warn("archive_classroom RPC notice:", rpcErr);
          }
        } catch (rpcEx) {
          console.warn("archive_classroom RPC call notice:", rpcEx);
        }
      }

      // 4. Fallback: Try direct Supabase table update with row count verification
      if (!backendUpdated) {
        try {
          const { data: updatedRows, error: sbErr } = await supabase
            .from(CLASSROOM_TABLE)
            .update({ is_archived: archive })
            .eq("id", classroomId)
            .select("id, is_archived");
          if (!sbErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
            backendUpdated = true;
          } else if (sbErr) {
            console.warn("Direct Supabase update notice:", sbErr);
          }
        } catch (sbErr) {
          console.warn("Direct Supabase update notice:", sbErr);
        }
      }

      // 5. If all persistence attempts failed, ROLLBACK optimistic state and alert the user
      if (!backendUpdated) {
        setClassrooms(previousClassrooms);
        setClassroomTab(previousTab);
        throw new Error(
          archive
            ? `Could not archive classroom on server: ${failureReason || "Database update failed. Please check your backend connection."}`
            : `Could not restore classroom on server: ${failureReason || "Database update failed. Please check your backend connection."}`
        );
      }

      // 6. Confirmed server persistence: update localStorage cache across all keys
      const storageKeys = [
        `writecheck_archived_classes_${profile?.id || "teacher"}`,
        "writecheck_archived_classes_teacher",
        "writecheck_archived_classes_global",
      ];
      storageKeys.forEach((key) => {
        try {
          const stored = JSON.parse(localStorage.getItem(key) || "[]");
          const set = new Set(Array.isArray(stored) ? stored.map(String) : []);
          if (archive) {
            set.add(classIdStr);
          } else {
            set.delete(classIdStr);
          }
          localStorage.setItem(key, JSON.stringify(Array.from(set)));
        } catch (cacheErr) {
          console.warn("Could not cache archived classroom ID:", cacheErr);
        }
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("writecheck:classroom_archived", {
            detail: { classroomId: classIdStr, isArchived: archive },
          })
        );
      }

      const target = previousClassrooms.find((c) => String(c.id) === classIdStr);
      const targetName = target?.name || "Classroom";
      setSuccessMessage(
        archive
          ? `Classroom "${targetName}" archived. You can find it in the Archived classes tab.`
          : `Classroom "${targetName}" restored to active classes.`
      );

      // 7. Silently refresh teacher data from DB to guarantee tab counts and lists are completely synced
      try {
        await loadTeacherData(true);
      } catch (syncErr) {
        console.warn("Silent teacher data sync notice:", syncErr);
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to update classroom archive status.");
    } finally {
      setIsArchiving(false);
      setArchivingClassroom(null);
    }
  };

  const handleOpenCopyModal = (classroom) => {
    setCopyingClassroom(classroom);
    setCopyForm({
      name: `Copy of ${classroom.name}`,
      section: classroom.section || "",
      subject:
        classroom.subject && classroom.subject !== "No subject"
          ? classroom.subject
          : classroom.name,
    });
  };

  const handleConfirmCopyClassroom = async (e) => {
    e.preventDefault();
    if (!copyingClassroom || !copyForm.name.trim() || !copyForm.section.trim()) {
      setErrorMessage("Enter a class name and section.");
      return;
    }
    setIsCopying(true);
    setErrorMessage("");

    try {
      const className = copyForm.name.trim();
      const section = copyForm.section.trim();
      const subject = copyForm.subject.trim() || className;

      // 1. Generate unique class code and create classroom
      let newClassroom = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const classroomCode = buildClassCode(className);
        const { data, error } = await supabase
          .from(CLASSROOM_TABLE)
          .insert({
            teacher_id: profile.id,
            teacher_name: profile.full_name || profile.email || "Teacher",
            classroom_name: className,
            classroom_code: classroomCode,
            subject: subject || null,
            section,
          })
          .select()
          .single();

        if (error?.code === "23505") continue;
        if (error) throw error;
        newClassroom = data;
        break;
      }

      if (!newClassroom) {
        throw new Error("Could not generate a unique class code. Please try again.");
      }

      // 2. Clone assignments from source classroom
      const { data: sourceAssignments, error: aError } = await supabase
        .from(ASSIGNMENT_TABLE)
        .select("title, instructions, due_date, accept_late_submissions")
        .eq("classroom_id", copyingClassroom.id);

      let copiedCount = 0;
      if (!aError && Array.isArray(sourceAssignments) && sourceAssignments.length > 0) {
        const clonedAssignments = sourceAssignments.map((a) => ({
          classroom_id: newClassroom.id,
          teacher_id: profile.id,
          title: a.title,
          instructions: a.instructions,
          due_date: a.due_date,
          accept_late_submissions: a.accept_late_submissions ?? true,
        }));
        const { error: insErr } = await supabase.from(ASSIGNMENT_TABLE).insert(clonedAssignments);
        if (!insErr) {
          copiedCount = clonedAssignments.length;
        }
      }

      setCopyingClassroom(null);
      setClassroomTab("active");
      setSuccessMessage(
        `Class copied! "${className}" created with code ${newClassroom.classroom_code} (${copiedCount} assignment${copiedCount === 1 ? "" : "s"} duplicated).`
      );
      await loadTeacherData();
    } catch (err) {
      setErrorMessage(err.message || "Failed to copy classroom.");
    } finally {
      setIsCopying(false);
    }
  };

  const handleExportClassroomCSV = async (classroom) => {
    try {
      const classId = classroom.id;
      const classSubmissions = submissions.filter((s) => s.classroomId === classId);

      const { data: members } = await supabase
        .from(MEMBER_TABLE)
        .select("student_id, student_name, student_email, created_at")
        .eq("classroom_id", classId);

      const studentList = members || [];
      const rows = [
        ["Classroom", classroom.name],
        ["Section", classroom.section],
        ["Subject", classroom.subject || ""],
        ["Status", classroom.isArchived ? "Archived" : "Active"],
        ["Export Date", new Date().toLocaleDateString()],
        [],
        ["Student Name", "Student Email", "Joined Date", "Assignments Submitted", "Average Grade", "Flagged Submissions"],
      ];

      if (studentList.length === 0) {
        rows.push(["No enrolled students in this classroom"]);
      } else {
        studentList.forEach((m) => {
          const studentSubs = classSubmissions.filter((s) => s.studentId === m.student_id);
          const gradedSubs = studentSubs.filter(
            (s) => s.grade !== undefined && s.grade !== null && s.grade !== ""
          );
          const avgGrade =
            gradedSubs.length > 0
              ? (
                  gradedSubs.reduce((acc, s) => acc + (parseFloat(s.grade) || 0), 0) /
                  gradedSubs.length
                ).toFixed(1)
              : "N/A";
          const flaggedCount = studentSubs.filter(
            (s) => s.status === "flagged" || s.scanResult?.similarityScore > 20
          ).length;
          rows.push([
            m.student_name || "Student",
            m.student_email || "",
            m.created_at ? new Date(m.created_at).toLocaleDateString() : "",
            studentSubs.length,
            avgGrade,
            flaggedCount,
          ]);
        });
      }

      const csvContent =
        "data:text/csv;charset=utf-8," +
        rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `${classroom.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_summary.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccessMessage(`Exported CSV for "${classroom.name}".`);
    } catch (err) {
      setErrorMessage("Could not export classroom CSV: " + err.message);
    }
  };

  const handleCreateClassroom = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSavingClassroom(true);

    const className =
      classroomForm.name.trim();

    const section =
      classroomForm.section.trim();

    const subject =
      className;

    if (!className || !section) {
      setErrorMessage("Enter a subject name and section.");
      setIsSavingClassroom(false);
      return;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const classroomCode =
        buildClassCode(className);

      const { error } =
        await supabase
          .from(CLASSROOM_TABLE)
          .insert({
            teacher_id: profile.id,
            teacher_name: profile.full_name || profile.email || "Teacher",
            classroom_name: className,
            classroom_code: classroomCode,
            subject: subject || null,
            section,
          });

      if (error?.code === "23505") {
        continue;
      }

      if (error) {
        setErrorMessage(error.message);
        setIsSavingClassroom(false);
        return;
      }

      setClassroomForm(emptyClassroomForm);
      setIsCreatingClassroom(false);
      setClassroomTab("active");
      setSuccessMessage(`Class created. Code: ${classroomCode}`);
      setIsSavingClassroom(false);
      await loadTeacherData();
      return;
    }

    setErrorMessage("Could not generate a unique class code. Try again.");
    setIsSavingClassroom(false);
  };

  const handleCreateAssignment = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSavingAssignment(true);

    const classroomId =
      assignmentForm.classroomId || selectedClassroom.id;

    const dueDate =
      assignmentForm.dueDate
        ? new Date(assignmentForm.dueDate).toISOString()
        : null;

    const payload = {
      classroom_id: classroomId,
      teacher_id: profile.id,
      title: assignmentForm.title.trim(),
      instructions: assignmentForm.instructions.trim() || null,
      due_date: dueDate,
      accept_late_submissions: assignmentForm.acceptLateSubmissions !== false,
    };

    let { error } = await supabase.from(ASSIGNMENT_TABLE).insert(payload);

    if (error && (error.message?.includes("accept_late_submissions") || error.code === "42703" || error.code === "PGRST204")) {
      delete payload.accept_late_submissions;
      const retry = await supabase.from(ASSIGNMENT_TABLE).insert(payload);
      error = retry.error;
    }

    if (error) {
      setErrorMessage(error.message);
      setIsSavingAssignment(false);
      return;
    }

    setAssignmentForm({
      ...emptyAssignmentForm,
      classroomId,
    });
    setIsCreatingAssignment(false);
    setSuccessMessage("Assignment created.");
    setIsSavingAssignment(false);
    await loadTeacherData();
  };

  const handleOpenEditAssignment = (assignment) => {
    setEditingAssignment({
      id: assignment.id,
      classroomId: assignment.classroomId,
      title: assignment.title || "",
      instructions: assignment.instructions || "",
      dueDate: toDateTimeLocalInput(assignment.dueDate),
      acceptLateSubmissions: assignment.acceptLateSubmissions !== false,
    });
  };

  const handleCloseEditAssignment = () => {
    setEditingAssignment(null);
    setIsUpdatingAssignment(false);
  };

  const handleUpdateAssignment = async (event) => {
    event.preventDefault();
    if (!editingAssignment) return;

    setErrorMessage("");
    setSuccessMessage("");
    setIsUpdatingAssignment(true);

    try {
      const dueDate = editingAssignment.dueDate
        ? new Date(editingAssignment.dueDate).toISOString()
        : null;

      const updatePayload = {
        classroom_id: editingAssignment.classroomId,
        title: editingAssignment.title.trim(),
        instructions: editingAssignment.instructions?.trim() || null,
        due_date: dueDate,
        accept_late_submissions: editingAssignment.acceptLateSubmissions !== false,
      };

      let { error: updateError } = await supabase
        .from(ASSIGNMENT_TABLE)
        .update(updatePayload)
        .eq("id", editingAssignment.id)
        .eq("teacher_id", profile.id);

      if (updateError && (updateError.message?.includes("accept_late_submissions") || updateError.code === "42703" || updateError.code === "PGRST204")) {
        delete updatePayload.accept_late_submissions;
        const retry = await supabase
          .from(ASSIGNMENT_TABLE)
          .update(updatePayload)
          .eq("id", editingAssignment.id)
          .eq("teacher_id", profile.id);
        updateError = retry.error;
      }

      if (updateError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Assignment update failed:", {
            assignmentId: editingAssignment.id,
            error: updateError,
          });
        }
        setErrorMessage(updateError.message || "Failed to update assignment.");
        return;
      }

      // Verify the persisted values separately. Update responses may omit rows
      // when the project's Supabase policies do not allow returning rows.
      const { data: updatedAssignment, error: verifyError } = await supabase
        .from(ASSIGNMENT_TABLE)
        .select("id, created_at, classroom_id, teacher_id, title, instructions, due_date")
        .eq("id", editingAssignment.id)
        .eq("teacher_id", profile.id)
        .maybeSingle();

      if (verifyError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Assignment update verification failed:", {
            assignmentId: editingAssignment.id,
            error: verifyError,
          });
        }
        setErrorMessage(verifyError.message || "Could not verify the assignment update.");
        return;
      }

      const savedValuesMatch =
        updatedAssignment &&
        updatedAssignment.classroom_id === editingAssignment.classroomId &&
        updatedAssignment.title === editingAssignment.title.trim() &&
        (updatedAssignment.instructions || null) ===
          (editingAssignment.instructions?.trim() || null) &&
        (updatedAssignment.due_date
          ? new Date(updatedAssignment.due_date).getTime()
          : null) === (dueDate ? new Date(dueDate).getTime() : null);

      if (!savedValuesMatch) {
        if (process.env.NODE_ENV === "development") {
          console.error("Assignment update values did not persist:", {
            assignmentId: editingAssignment.id,
            expected: {
              classroomId: editingAssignment.classroomId,
              title: editingAssignment.title.trim(),
              instructions: editingAssignment.instructions?.trim() || null,
              dueDate,
            },
            actual: updatedAssignment,
          });
        }
        setErrorMessage(
          "The assignment was not updated. It may have been removed or you no longer have permission to edit it."
        );
        return;
      }

      const classroomsById = new Map(
        classrooms.map((classroom) => [classroom.id, classroom])
      );
      const currentAssignment = assignments.find(
        (assignment) => assignment.id === updatedAssignment.id
      );

      setAssignments((currentAssignments) =>
        currentAssignments.map((assignment) =>
          assignment.id === updatedAssignment.id
            ? normalizeAssignment(updatedAssignment, classroomsById, {
                submissions: currentAssignment?.submissions ?? assignment.submissions,
              })
            : assignment
        )
      );

      const didRefresh = await loadTeacherData();
      if (!didRefresh) {
        if (process.env.NODE_ENV === "development") {
          console.error("Assignment saved but dashboard refresh failed:", {
            assignmentId: updatedAssignment.id,
          });
        }
        setErrorMessage("The assignment was saved, but the dashboard could not refresh its data.");
        return;
      }

      setEditingAssignment(null);
      setSuccessMessage("Assignment updated successfully.");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Assignment update request failed:", err);
      }
      setErrorMessage(err.message || "Could not update assignment.");
    } finally {
      setIsUpdatingAssignment(false);
    }
  };

  const handleCopyTranscript = (textToCopy) => {
    const text = textToCopy || transcribedText || manualLiveOcrText;
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleTransferToText = () => {
    const text = transcribedText || manualLiveOcrText;
    if (!text) return;
    setManualCheckText(text);
    setUploadMode("text");
  };

  const handleLoadSampleEssay = async () => {
    try {
      setManualCheckError("");
      const response = await apiFetch("/samples/sample_student_essay.jpg");
      if (!response.ok) throw new Error("Sample file not found");
      const blob = await response.blob();
      const sampleFile = new File([blob], "sample_student_essay.jpg", {
        type: "image/jpeg",
      });

      setManualCheckFiles([sampleFile]);
      setUploadMode("picture");
      setManualCheckResult(null);
      setTranscribedText("");
      setTranscriptionResult(null);
      setManualLiveOcrResult(null);
      setShowLineBreakdown(false);
    } catch {
      setManualCheckError("Could not load sample handwritten essay image.");
    }
  };

  const handleTranscribePicture = async (fileToTranscribe) => {
    const imageFile =
      fileToTranscribe ||
      manualCheckFiles.find((file) => file.type?.startsWith("image/"));

    if (!imageFile) {
      setManualCheckError("Please select a valid image file to transcribe.");
      return;
    }

    setIsTranscribing(true);
    setManualCheckError("");
    setManualLiveOcrResult({
      fileName: imageFile.name,
      text: "",
      lines: [],
      boxes: [],
      rawBoxes: [],
      detectedLineCount: 0,
      processedLineCount: 0,
      duplicateLineCount: 0,
      truncated: false,
    });

    try {
      const result = await extractTextFromImage(imageFile, {
        onProgress: (progress) => {
          setManualLiveOcrResult({
            fileName: imageFile.name,
            text: progress.text || "",
            lines: progress.lines ?? [],
            boxes: progress.boxes ?? [],
            rawBoxes: progress.rawBoxes ?? [],
            detectedLineCount: progress.detectedLineCount ?? 0,
            duplicateLineCount: progress.duplicateLineCount ?? 0,
            processedLineCount: progress.processedLineCount ?? 0,
            truncated: progress.truncated,
          });
        },
      });

      const fullText = result.text || "";
      setTranscribedText(fullText);
      setTranscriptionResult(result);
      setManualLiveOcrResult(result);
    } catch (error) {
      setManualCheckError(error.message || "Failed to transcribe handwriting.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleManualCheckFiles = (event) => {
    const nextFiles =
      Array.from(event.target.files ?? []);

    setManualCheckFiles(nextFiles);
    setManualCheckResult(null);
    setManualLiveOcrResult(null);
    setTranscribedText("");
    setTranscriptionResult(null);
    setShowLineBreakdown(false);
    setManualCheckError("");

    if (nextFiles.length > 0 && uploadMode === "text") {
      setUploadMode("file");
    }
  };

  const handleRunManualCheck = async (event) => {
    event.preventDefault();
    setManualCheckError("");
    setManualCheckResult(null);

    const hasImage = manualCheckFiles.some((f) => f.type?.startsWith("image/"));

    if (!manualCheckText.trim() && manualCheckFiles.length === 0 && !transcribedText.trim()) {
      setManualCheckError("Add a picture, file, or pasted text before scanning.");
      return;
    }

    setIsScanningManualCheck(true);

    try {
      let fileText;

      if (hasImage && transcribedText.trim()) {
        const imageFile = manualCheckFiles.find((f) => f.type?.startsWith("image/"));
        const nonImageFiles = manualCheckFiles.filter((f) => !f.type?.startsWith("image/"));
        let nonImageText = { text: "", readableFiles: [], unreadableFiles: [], extractedText: "" };
        if (nonImageFiles.length > 0) {
          nonImageText = await readTextFromFiles(nonImageFiles);
        }

        const imageTranscriptBlock = `Image: ${imageFile?.name || "Uploaded Picture"}\n${transcribedText}`;

        fileText = {
          text: [nonImageText.text, imageTranscriptBlock].filter(Boolean).join("\n\n"),
          extractedText: [nonImageText.extractedText, transcribedText].filter(Boolean).join("\n\n"),
          extractedImages: [{
            name: imageFile?.name || "Uploaded Picture",
            text: transcribedText,
            lines: transcriptionResult?.lines ?? manualLiveOcrResult?.lines ?? [],
            boxes: transcriptionResult?.boxes ?? manualLiveOcrResult?.boxes ?? [],
            detectedLineCount: transcriptionResult?.detectedLineCount ?? manualLiveOcrResult?.detectedLineCount ?? 0,
            duplicateLineCount: transcriptionResult?.duplicateLineCount ?? manualLiveOcrResult?.duplicateLineCount ?? 0,
            processedLineCount: transcriptionResult?.processedLineCount ?? manualLiveOcrResult?.processedLineCount ?? 0,
            truncated: transcriptionResult?.truncated ?? false,
          }],
          readableFiles: [...nonImageText.readableFiles, ...(imageFile ? [imageFile] : [])],
          unreadableFiles: nonImageText.unreadableFiles,
        };
      } else {
        fileText =
          await readTextFromFiles(manualCheckFiles, {
            onImageProgress: (progress) => {
              setManualLiveOcrResult({
                fileName: progress.file?.name || "Image",
                text: progress.text || "",
                lines: progress.lines ?? [],
                boxes: progress.boxes ?? [],
                rawBoxes: progress.rawBoxes ?? [],
                detectedLineCount: progress.detectedLineCount ?? 0,
                duplicateLineCount: progress.duplicateLineCount ?? 0,
                processedLineCount: progress.processedLineCount ?? 0,
                truncated: progress.truncated,
              });
            },
          });

        if (fileText.extractedImages?.[0]?.text) {
          setTranscribedText(fileText.extractedImages[0].text);
          setTranscriptionResult({
            text: fileText.extractedImages[0].text,
            lines: fileText.extractedImages[0].lines ?? [],
            boxes: fileText.extractedImages[0].boxes ?? [],
            detectedLineCount: fileText.extractedImages[0].detectedLineCount,
            duplicateLineCount: fileText.extractedImages[0].duplicateLineCount,
            processedLineCount: fileText.extractedImages[0].processedLineCount,
            truncated: fileText.extractedImages[0].truncated,
          });
        }
      }

      const combinedText =
        [manualCheckText, fileText.text, transcribedText]
          .map((value) => value.trim())
          .filter(Boolean)
          .join("\n\n");

      let scanResult = null;
      const nonImageFile = manualCheckFiles.find((f) => !f.type?.startsWith("image/"));
      if (nonImageFile || combinedText.trim().length >= 15) {
        setPlagiarismScanProgressText("Submitting to Copyleaks Plagiarism API...");

        try {
          const submission = await checkPlagiarismViaBackend({
            text: combinedText,
            file: nonImageFile || null,
            filename: manualCheckTitle.trim() || nonImageFile?.name || "essay.txt",
            userId: profile?.id || "teacher",
          });

          setPlagiarismScanProgressText("Analyzing sources & text with Copyleaks...");
          scanResult = await pollPlagiarismScanResult(submission.scan_id, {
            onProgress: (pScan, attempt) => {
              setPlagiarismScanProgressText(`Analyzing sources with Copyleaks (check ${attempt})...`);
            },
          });
        } catch (scanErr) {
          console.warn("Copyleaks scan error, falling back to local analysis:", scanErr);
        }
      }

      const localResult = analyzePlagiarismInput({
        text: combinedText,
        files: manualCheckFiles,
      });

      const finalScore =
        scanResult?.plagiarism_score !== undefined
          ? Math.round(scanResult.plagiarism_score)
          : localResult.score;

      const finalTone =
        finalScore >= 50 ? "red" : finalScore >= 20 ? "amber" : "emerald";

      const finalLabel =
        finalScore >= 50
          ? "High review"
          : finalScore >= 20
            ? "Medium review"
            : "Low review";

      setManualCheckResult({
        ...localResult,
        title: manualCheckTitle.trim() || "Plagiarism check",
        score: finalScore,
        tone: finalTone,
        label: finalLabel,
        wordCount: scanResult?.total_words || localResult.wordCount,
        identicalWords: scanResult?.identical_words ?? 0,
        scanStatus: scanResult?.status === "completed" ? "Completed" : "Completed",
        matchedSources: scanResult?.result_data?.matched_sources || [],
        extractedText: fileText.extractedText,
        extractedImages: fileText.extractedImages,
        readableFiles: fileText.readableFiles,
        unreadableFiles: fileText.unreadableFiles,
        imageUrl:
          manualImagePreview ||
          (manualCheckFiles[0]?.name ? `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/uploads/${manualCheckFiles[0].name}` : ""),
        imageName: manualCheckFiles[0]?.name || manualCheckTitle || "Submission image",
        summary: scanResult
          ? "Scanned via Copyleaks Authenticity API. Comprehensive database and source matching completed."
          : localResult.summary,
      });
    } catch (error) {
      setManualCheckError(error.message || "Could not scan the selected material.");
    } finally {
      setIsScanningManualCheck(false);
      setPlagiarismScanProgressText("");
    }
  };

  const handleResetManualCheck = () => {
    setManualCheckTitle("");
    setManualCheckText("");
    setManualCheckFiles([]);
    setManualImagePreview("");
    setManualCheckResult(null);
    setManualLiveOcrResult(null);
    setTranscribedText("");
    setTranscriptionResult(null);
    setShowLineBreakdown(false);
    setManualCheckError("");
    setUploadMode("");
    setPlagiarismScanProgressText("");
    setIsEditingTranscript(false);
    setIsManualImageExpanded(false);
    setLoadedSubmissionInfo(null);
    setLoadingSubmissionId(null);
    setSubmissionHubSearch("");
    setSubmissionHubClassroomId("all");
    setSubmissionHubFilter("all");
    setSubmissionHubSort("newest");
    setScanRosterFilter("all");
    setScanRosterSearch("");
  };

  const handleSelectScanAssignment = (assignmentId) => {
    setSubmissionHubFilter(assignmentId);
    if (!assignmentId || assignmentId === "all") return;
    const matched = assignments.find((a) => String(a.id) === String(assignmentId));
    if (matched) {
      if (submissionHubClassroomId !== "all" && String(submissionHubClassroomId) !== String(matched.classroomId)) {
        setSubmissionHubClassroomId(String(matched.classroomId));
      }
      setManualCheckTitle(`${matched.title} — ${matched.classroomName || "Class"}`);
    }
  };

  const handleSelectScanClassroom = (classroomId) => {
    setSubmissionHubClassroomId(classroomId);
    if (classroomId !== "all" && selectedScanAssignment && String(selectedScanAssignment.classroomId) !== String(classroomId)) {
      setSubmissionHubFilter("all");
    }
  };

  const handleLoadSubmissionToScanStation = async (sub) => {
    if (!sub) return;
    setManualCheckError("");
    setManualCheckResult(null);
    setManualLiveOcrResult(null);
    setTranscriptionResult(null);
    setLoadingSubmissionId(sub.id);

    const title = `${selectedScanAssignment?.title || sub.essayTitle || "Essay"} — ${sub.studentName || "Student"}`;
    setManualCheckTitle(title);

    const fileUrl = sub.fileUrl || sub.file_url;
    setLoadedSubmissionInfo({
      id: sub.id,
      studentName: sub.studentName || "Student",
      essayTitle: sub.essayTitle || "Essay submission",
      assignmentTitle: selectedScanAssignment?.title || sub.assignmentTitle || "Assignment",
      fileUrl: fileUrl || null,
      submittedAt: sub.createdAt,
    });

    try {
      if (fileUrl) {
        let blob = null;
        try {
          blob = await downloadSubmissionFileBlob(fileUrl);
        } catch (fetchErr) {
          console.warn("Could not download submission file blob directly:", fetchErr);
        }

        const isImgUrl = /\.(jpe?g|png|webp|gif|bmp|tiff)($|\?)/i.test(fileUrl);
        const isImage = (blob && blob.type && blob.type.startsWith("image/")) || isImgUrl;

        let cleanFilename = "";
        try {
          cleanFilename = decodeURIComponent(fileUrl.split("?")[0].split("/").pop());
        } catch {
          cleanFilename = "";
        }
        if (!cleanFilename || cleanFilename.length > 80 || cleanFilename.startsWith("blob:")) {
          cleanFilename = `${sub.studentName || "student"}_${(sub.essayTitle || "essay").replace(/[^a-zA-Z0-9_-]/g, "_")}${isImage ? ".jpg" : ".pdf"}`;
        }

        if (blob) {
          const file = new File([blob], cleanFilename, {
            type: blob.type || (isImage ? "image/jpeg" : "application/pdf"),
            lastModified: Date.now(),
          });
          setManualCheckFiles([file]);

          if (isImage) {
            setUploadMode("picture");
            const previewUrl = URL.createObjectURL(blob);
            setManualImagePreview(previewUrl);
            if (sub.transcribedText) {
              setTranscribedText(sub.transcribedText);
            }
          } else {
            setUploadMode("file");
            setManualImagePreview("");
            // Automatically extract text in background so it's loaded and ready
            try {
              const fileTextResult = await readTextFromFiles([file]);
              if (fileTextResult?.text) {
                setManualCheckText(fileTextResult.text);
              }
            } catch (err) {
              console.warn("Could not pre-read text from loaded submission file:", err);
            }
          }
        } else {
          // If blob download failed, fallback to text/transcribed or picture mode
          if (isImage) {
            setUploadMode("picture");
            try {
              const resolvedUrl = await resolveStorageImageUrl(fileUrl);
              if (resolvedUrl) setManualImagePreview(resolvedUrl);
            } catch {}
            if (sub.transcribedText) setTranscribedText(sub.transcribedText);
          } else if (sub.essayText || sub.transcribedText) {
            setUploadMode("text");
            setManualCheckText(sub.essayText || sub.transcribedText);
          } else {
            setUploadMode("file");
          }
        }
      } else if (sub.essayText || sub.transcribedText) {
        setUploadMode("text");
        setManualCheckText(sub.essayText || sub.transcribedText);
        setManualCheckFiles([]);
        setManualImagePreview("");
      }

      if (sub.scanResult) {
        const score = Math.round(sub.scanResult.plagiarism_score ?? sub.scanResult.score ?? 0);
        setManualCheckResult({
          ...sub.scanResult,
          title: sub.essayTitle || title,
          score,
          label: sub.scanResult.label || (score >= 50 ? "High review" : score >= 20 ? "Medium review" : "Low review"),
          tone: score >= 50 ? "red" : score >= 20 ? "amber" : "emerald",
        });
      }
    } finally {
      setLoadingSubmissionId(null);
    }

    const stationElem = document.getElementById("scan-station-form-top") || document.getElementById("scan-station-container");
    if (stationElem) {
      stationElem.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 180, behavior: "smooth" });
    }
  };

  const handleOpenReview = (submission) => {
    setReviewingSubmission(submission);
    setGradeInput(String(submission.grade ?? ""));
    setFeedbackInput(String(submission.feedback ?? ""));
    setReviewCopySuccess(false);
    setReviewImagePreviewUrl("");
    setIsImageExpanded(false);

    // Calculate actual peer submissions for THIS assignment and classroom/section only
    const currentAssignmentId = submission.assignmentId || submission.assignment_id;
    const currentClassroomId = submission.classroomId || submission.classroom_id;
    const classmateCount = (submissions || []).filter(
      (s) =>
        (s.assignmentId || s.assignment_id) === currentAssignmentId &&
        (!currentClassroomId || (s.classroomId || s.classroom_id) === currentClassroomId) &&
        s.id !== submission.id
    ).length;

    if (submission.scanResult) {
      let initialScanResult = { ...submission.scanResult };
      if (classmateCount === 0) {
        initialScanResult.peerSimilarity = {
          peer_similarity_score: 0.0,
          has_peer_match: false,
          highest_match_submission_id: null,
          matched_submission_label: null,
          matching_snippets: [],
          all_matches: [],
          total_peers_compared: 0,
        };
        initialScanResult.peerScore = 0.0;
      } else if (
        initialScanResult.peerSimilarity &&
        initialScanResult.peerSimilarity.total_peers_compared > classmateCount
      ) {
        initialScanResult.peerSimilarity = {
          ...initialScanResult.peerSimilarity,
          total_peers_compared: classmateCount,
        };
      }
      setReviewScanResult(initialScanResult);
      setReviewTranscribedText(submission.transcribedText || initialScanResult.transcribedText || "");
    } else if (manualCheckResult && manualCheckResult.score !== undefined) {
      setReviewScanResult(manualCheckResult);
      setReviewTranscribedText(transcribedText || manualDetectedText || "");
    } else {
      setReviewScanResult(null);
      setReviewTranscribedText("");
    }

    // Load image preview
    const fileUrl = submission.fileUrl;
    if (!fileUrl) return;
    const isImageUrl = /\.(jpe?g|png|webp|gif)$/i.test(fileUrl) ||
      fileUrl.includes("/submissions/") ||
      /\.(jpe?g|png|webp|gif)/i.test(fileUrl);

    if (isImageUrl) {
      setIsLoadingImagePreview(true);
      resolveStorageImageUrl(fileUrl)
        .then((resolvedUrl) => {
          if (resolvedUrl) setReviewImagePreviewUrl(resolvedUrl);
        })
        .catch((err) => {
          console.warn("Failed to resolve image preview URL:", err);
        })
        .finally(() => setIsLoadingImagePreview(false));
    }
  };

  const handleCloseReview = () => {
    if (isSavingGrade || isReviewScanning) return;
    setReviewingSubmission(null);
    setGradeInput("");
    setFeedbackInput("");
    setReviewScanResult(null);
    setReviewTranscribedText("");
    setIsReviewScanning(false);
    setReviewScanProgressText("");
    setReviewCopySuccess(false);
    setReviewImagePreviewUrl("");
    setIsLoadingImagePreview(false);
    setIsImageExpanded(false);
  };

  const handleCopyReviewTranscript = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setReviewCopySuccess(true);
      setTimeout(() => setReviewCopySuccess(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleRunReviewScan = async () => {
    if (!reviewingSubmission || isReviewScanning || isSavingGrade) return;
    setIsReviewScanning(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.rpc("retry_submission_processing", {
        submission_key: String(reviewingSubmission.id),
        corrected_text: reviewTranscribedText.trim() || null,
      });
      if (error || !data?.state) throw new Error(error?.message || "Could not queue this check.");
      const update = (row) => ({ ...row, returnedAt: null, processingState: data.state, processingError: null });
      setSubmissions((rows) => rows.map((row) => row.id === reviewingSubmission.id ? update(row) : row));
      setReviewingSubmission(update);
      setSuccessMessage("Check queued. You can close this window; processing continues on the server.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsReviewScanning(false);
      setReviewScanProgressText("");
    }
  };

  useEffect(() => {
    if (!reviewingSubmission) return;
    const latest = submissions.find((row) => row.id === reviewingSubmission.id);
    if (!latest || !latest.processingState || (latest.processingState === reviewingSubmission.processingState
      && latest.processingError === reviewingSubmission.processingError)) return;
    setReviewingSubmission((current) => ({ ...current, ...latest }));
    if (latest.processingState === "ready") {
      setReviewTranscribedText(latest.transcribedText || "");
      setReviewScanResult(latest.scanResult || null);
    }
  }, [submissions, reviewingSubmission]);

  const handleSaveGrade = async (event, returnWork = false) => {
    if (event) event.preventDefault();
    if (!reviewingSubmission || isSavingGrade || isReviewScanning) return;
    if (reviewTranscribedText.trim() !== String(reviewingSubmission.transcribedText || "").trim()) {
      setErrorMessage("Recheck the corrected transcription before saving or returning the grade.");
      return;
    }

    setIsSavingGrade(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const gradeVal = String(gradeInput ?? "").trim();
      const feedbackVal = String(feedbackInput ?? "").trim();
      const subId = reviewingSubmission.id;
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
      const response = await apiFetch(`${backendUrl}/api/submissions/${subId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: gradeVal, feedback: feedbackVal,
          status: gradeVal ? "graded" : "submitted",
          assignment_id: reviewingSubmission.assignmentId || reviewingSubmission.assignment_id,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.grade_record) {
        throw new Error(typeof result.detail === "string" ? result.detail : "Grade was not saved. Please try again.");
      }
      const saved = result.grade_record;
      setSubmissions((prev) => prev.map((submission) => submission.id === subId
        ? { ...submission, grade: saved.grade ?? "", feedback: saved.feedback ?? "",
            returnedAt: saved.returned_at, status: saved.status, transcribedText: saved.transcribed_text ?? "",
            scanResult: saved.scan_result ?? null }
        : submission));
      setSuccessMessage(`Grade saved for ${reviewingSubmission.studentName}.`);
      setReviewingSubmission((current) => ({ ...current, grade: saved.grade ?? "",
        feedback: saved.feedback ?? "", returnedAt: saved.returned_at,
        transcribedText: saved.transcribed_text ?? "", scanResult: saved.scan_result ?? null }));
      if (returnWork) {
        const { data: released, error: releaseError } = await supabase.rpc("return_submission", {
          submission_key: String(subId),
        });
        if (releaseError || !released?.returned_at) {
          throw new Error(`Grade saved, but could not return work. ${releaseError?.message || "Please retry Return work."}`);
        }
        setSubmissions((rows) => rows.map((row) => row.id === subId
          ? { ...row, returnedAt: released.returned_at } : row));
        setReviewingSubmission((row) => ({ ...row, returnedAt: released.returned_at }));
        setSuccessMessage("Work returned. The student can now see the saved results.");
      }
    } catch (error) {
      setSuccessMessage("");
      setErrorMessage(error.message || "Could not save. Your changes are still here; please retry.");
    } finally {
      setIsSavingGrade(false);
    }
  };

  const handleReturnWork = () => {
    if (!String(gradeInput ?? "").trim()) {
      setErrorMessage("Enter a grade before returning work.");
      return;
    }
    return handleSaveGrade(null, true);
  };

  const manualResultBadgeClass =
    manualCheckResult?.tone === "red"
      ? "bg-red-50 text-red-700"
      : manualCheckResult?.tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";

  const manualResultRingClass =
    manualCheckResult?.tone === "red"
      ? "text-red-700 ring-red-100"
      : manualCheckResult?.tone === "amber"
        ? "text-amber-700 ring-amber-100"
        : "text-emerald-700 ring-emerald-100";

  const reviewResultBadgeClass =
    reviewScanResult?.tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : reviewScanResult?.tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-emerald-50 text-emerald-800 border-emerald-200";

  const reviewResultRingClass =
    reviewScanResult?.tone === "red"
      ? "text-red-700 ring-red-100"
      : reviewScanResult?.tone === "amber"
        ? "text-amber-700 ring-amber-100"
        : "text-emerald-700 ring-emerald-100";

  const manualDetectedText =
    (typeof manualCheckResult?.extractedText === "string"
      ? manualCheckResult.extractedText
      : Array.isArray(manualCheckResult?.extractedText)
        ? manualCheckResult.extractedText.join("\n\n")
        : (manualCheckResult?.transcribedText || transcribedText || manualCheckText || "")
    )?.trim() ?? "";

  const manualLiveOcrText =
    (typeof manualLiveOcrResult?.text === "string"
      ? manualLiveOcrResult.text.trim()
      : "") ?? "";

  const hasManualImageExtraction =
    (manualCheckResult?.extractedImages?.length ?? 0) > 0 ||
    uploadMode === "picture" ||
    Boolean(transcriptionResult?.detectedLineCount || manualLiveOcrResult?.detectedLineCount);

  const manualImageExtractionSummary =
    (manualCheckResult?.extractedImages ?? [])
      .flatMap((image) => {
        const summaries = [];

        if (image.duplicateLineCount > 0) {
          summaries.push(
            `${image.name}: removed ${image.duplicateLineCount} duplicate detected line${image.duplicateLineCount === 1 ? "" : "s"}.`
          );
        }

        if (image.truncated) {
          summaries.push(
            `${image.name}: showing ${image.processedLineCount} of ${image.detectedLineCount} detected lines for faster OCR.`
          );
        }

        return summaries;
      })
      .filter(Boolean);

  const renderAssignmentDetailsAndSubmissions = (onBack) => {
    if (!selectedAssignment) return null;

    return (
      <div className="space-y-6">
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dadce0] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack || (() => setSelectedAssignmentId(null))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              <span>Back to Classwork</span>
            </button>
            <span className="text-gray-300 font-bold">/</span>
            <span className="text-sm font-medium text-[#202124]">
              {selectedAssignment.classroomName}
            </span>
            <span className="inline-flex items-center rounded-md bg-[#f1f3f4] px-2 py-0.5 text-xs font-medium text-[#3c4043]">
              Section {selectedAssignment.classroomSection || "Standard"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleOpenEditAssignment(selectedAssignment)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333]"
          >
            <EditIcon className="h-3.5 w-3.5 text-[#5f6368]" />
            <span>Edit assignment</span>
          </button>
        </div>

        {/* Assignment Header Info */}
        <div className="rounded-xl border border-[#dadce0] bg-white p-6 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-medium text-[#137333]">
                  {selectedAssignment.classroomName}
                </span>
                <span className="inline-flex items-center rounded-md bg-[#f1f3f4] px-2.5 py-0.5 text-xs font-medium text-[#3c4043]">
                  Section {selectedAssignment.classroomSection || "All"}
                </span>
                {selectedAssignment.classroomSubject && (
                  <span className="inline-flex items-center rounded-md bg-[#f1f3f4] px-2.5 py-0.5 text-xs font-medium text-[#5f6368]">
                    {selectedAssignment.classroomSubject}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-2xl font-medium text-[#202124] tracking-tight break-words">
                {selectedAssignment.title}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#5f6368]">
                <span>
                  Due: <strong className="text-[#202124] font-medium">{formatDateTime(selectedAssignment.dueDate)}</strong>
                </span>
                <span>•</span>
                <span>100 points</span>
                <span>•</span>
                <span>
                  Posted: {formatDateTime(selectedAssignment.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Google Classroom Sub-tabs: Student work vs Instructions */}
          <div className="mt-6 flex border-b border-[#dadce0] text-sm">
            <button
              type="button"
              onClick={() => setAssignmentDetailTab("roster")}
              className={`px-4 py-2.5 font-medium transition-colors ${
                assignmentDetailTab === "roster"
                  ? "border-b-2 border-[#137333] text-[#137333]"
                  : "border-b-2 border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Student work ({assignmentStats.total})
            </button>
            <button
              type="button"
              onClick={() => setAssignmentDetailTab("instructions")}
              className={`px-4 py-2.5 font-medium transition-colors ${
                assignmentDetailTab === "instructions"
                  ? "border-b-2 border-[#137333] text-[#137333]"
                  : "border-b-2 border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Instructions
            </button>
          </div>

          {assignmentDetailTab === "instructions" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-[#dadce0] bg-[#f8f9fa] p-5">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[#5f6368]">
                  Assignment Instructions
                </h4>
                <p className="mt-3 text-sm text-[#202124] leading-relaxed whitespace-pre-wrap">
                  {selectedAssignment.instructions || "No detailed instructions provided for this assignment."}
                </p>
              </div>

              <div className="text-xs text-[#5f6368] space-y-1">
                <p>Class: <strong className="text-[#202124]">{selectedAssignment.classroomName}</strong></p>
                <p>Section: <strong className="text-[#202124]">{selectedAssignment.classroomSection || "Standard"}</strong></p>
                <p>Class code: <strong className="font-mono text-[#202124]">{selectedAssignment.classroomCode}</strong></p>
              </div>
            </div>
          ) : (
            <>
              {/* Google Classroom Student Work Metric Counters */}
              <div className="mt-6 grid grid-cols-3 gap-4 border-b border-[#dadce0] pb-6">
                <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-4 text-center">
                  <span className="text-xs font-medium text-[#137333] uppercase">
                    Turned in
                  </span>
                  <p className="mt-1 text-3xl font-medium text-[#137333]">
                    {assignmentStats.submitted}
                  </p>
                </div>

                <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-4 text-center">
                  <span className="text-xs font-medium text-[#5f6368] uppercase">
                    Assigned / Missing
                  </span>
                  <p className="mt-1 text-3xl font-medium text-[#5f6368]">
                    {assignmentStats.missing}
                  </p>
                </div>

                <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-4 text-center">
                  <span className="text-xs font-medium text-[#1967d2] uppercase">
                    Graded
                  </span>
                  <p className="mt-1 text-3xl font-medium text-[#1967d2]">
                    {assignmentStats.graded}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {assignmentDetailTab === "roster" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black text-gray-950">
                Student Submissions ({assignmentRoster.length})
              </h3>
              <p className="mt-0.5 text-xs font-bold text-gray-500">
                Students enrolled in <span className="text-emerald-700 font-extrabold">{selectedAssignment.classroomName} — Section: {selectedAssignment.classroomSection}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={submissionRosterSearch}
                  onChange={(e) => setSubmissionRosterSearch(e.target.value)}
                  placeholder="Filter student..."
                  className="h-9 w-40 sm:w-52 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs font-semibold text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-xs font-extrabold">
                <button
                  type="button"
                  onClick={() => setSubmissionRosterFilter("all")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    submissionRosterFilter === "all"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  All ({assignmentStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionRosterFilter("submitted")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    submissionRosterFilter === "submitted"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  Submitted ({assignmentStats.submitted})
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionRosterFilter("graded")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    submissionRosterFilter === "graded"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  Graded ({assignmentStats.graded})
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionRosterFilter("missing")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    submissionRosterFilter === "missing"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  Missing ({assignmentStats.missing})
                </button>
              </div>
            </div>
          </div>

          {/* Submissions Roster Table */}
          {assignmentStats.total > 0 && assignmentStats.submitted === 0 && (
            <div className="rounded-xl border border-dashed border-[#dadce0] bg-white px-5 py-6 text-center">
              <p className="text-sm font-medium text-[#202124]">No submissions yet</p>
              <p className="mt-1 text-xs text-[#5f6368]">
                Students who submit this assignment will appear here.
              </p>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
            <div className="grid grid-cols-[1.3fr_1fr_1.2fr_1.1fr_0.9fr] gap-4 border-b border-gray-200 bg-gray-50/75 px-5 py-3.5 text-xs font-extrabold uppercase tracking-wider text-gray-500">
              <span>Student</span>
              <span>Status</span>
              <span>Submitted File</span>
              <span>Grade & Feedback</span>
              <span className="text-right">Action</span>
            </div>

            {filteredAssignmentRoster.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-gray-500">
                  {assignmentRoster.length === 0
                    ? "No students enrolled in this classroom section yet."
                    : "No students match the current filter."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredAssignmentRoster.map((item) => (
                  <div
                    key={item.studentId}
                    className="grid grid-cols-[1.3fr_1fr_1.2fr_1.1fr_0.9fr] items-center gap-4 px-5 py-4 text-sm transition hover:bg-gray-50/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">
                        {item.studentName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-gray-950">
                          {item.studentName}
                        </p>
                        {item.studentEmail && (
                          <p className="truncate text-xs font-semibold text-gray-500">
                            {item.studentEmail}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      {item.status === "graded" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">
                          <CheckIcon className="h-3.5 w-3.5" />
                          Graded
                        </span>
                      )}
                      {item.status === "late" && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                          Late Submission
                        </span>
                      )}
                      {item.status === "submitted" && (
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-800">
                          Submitted
                        </span>
                      )}
                      {item.status === "missing" && (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-800">
                          Missing
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      {item.fileUrl ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openSubmissionFile(item.fileUrl, setErrorMessage)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline truncate"
                            title="Open submitted file"
                          >
                            <FileIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="truncate">{item.essayTitle || "View Submission"}</span>
                            <ExternalLinkIcon className="h-3 w-3 shrink-0 text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSubmissionFileBlob(item.fileUrl, item.studentName)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Download file"
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-gray-400">
                          No file submitted
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      {item.grade ? (
                        <div>
                          <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-900">
                            {item.grade}
                          </span>
                          {item.feedback && (
                            <p className="mt-1 truncate text-xs font-semibold text-gray-600" title={item.feedback}>
                              "{item.feedback}"
                            </p>
                          )}
                        </div>
                      ) : item.isSubmitted ? (
                        <span className="text-xs font-bold text-gray-400 italic">
                          Not graded yet
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-gray-300">—</span>
                      )}
                    </div>

                    <div className="text-right">
                      {item.submission ? (
                        <button
                          type="button"
                          onClick={() => handleOpenReview(item.submission)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-emerald-800 shadow-2xs"
                        >
                          <FileSearchIcon className="h-3.5 w-3.5" />
                          <span>{item.grade ? "Review" : "Review & Grade"}</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-gray-300">
                          No submission
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202124]">
      <Header
        profile={profile}
        onProfileUpdated={onProfileUpdated}
        workspace="Teacher workspace"
        pages={teacherPages}
        activePage={activePage}
        onPageChange={(page) => {
          setSuccessMessage("");
          setErrorMessage("");
          setActivePage(page);
        }}
      />

      <main className="mx-auto max-w-[1280px] px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-4 sm:mb-6">
          <StatusMessage
            error={errorMessage || submissionSyncError}
            message={successMessage}
          />
        </div>

        <section className="space-y-6">

        {/* Create Classroom Modal Dialog */}
        {isCreatingClassroom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between pb-4 border-b border-[#dadce0]">
                <div>
                  <h3 className="text-xl font-medium text-[#202124]">Create class</h3>
                  <p className="mt-0.5 text-xs text-[#5f6368]">Enter details for your new classroom section.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingClassroom(false);
                    setClassroomForm(emptyClassroomForm);
                  }}
                  className="rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateClassroom} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Subject name (required)</span>
                  <input
                    type="text"
                    value={classroomForm.name}
                    onChange={(e) => setClassroomForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. English 10, Biology Honors"
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] px-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Section (required)</span>
                  <input
                    type="text"
                    value={classroomForm.section}
                    onChange={(e) => setClassroomForm((f) => ({ ...f, section: e.target.value }))}
                    placeholder="e.g. Period 1, Section A"
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] px-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    required
                  />
                </label>

                <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#dadce0]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingClassroom(false);
                      setClassroomForm(emptyClassroomForm);
                    }}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingClassroom}
                    className="rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white hover:bg-[#0f5b28] disabled:bg-gray-300"
                  >
                    {isSavingClassroom ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Assignment Modal Dialog */}
        {isCreatingAssignment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between pb-4 border-b border-[#dadce0]">
                <div>
                  <h3 className="text-xl font-medium text-[#202124]">Create assignment</h3>
                  <p className="mt-0.5 text-xs text-[#5f6368]">Post instructions and due date for your classroom section.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingAssignment(false);
                    setAssignmentForm(emptyAssignmentForm);
                  }}
                  className="rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateAssignment} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Classroom & Section</span>
                  <select
                    value={assignmentForm.classroomId || selectedClassroom.id}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, classroomId: e.target.value }))}
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] bg-white px-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    required
                  >
                    {activeClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Section {c.section} {c.subject ? `(${c.subject})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Title</span>
                  <input
                    type="text"
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Narrative Essay Draft"
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] px-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Instructions (optional)</span>
                  <textarea
                    value={assignmentForm.instructions}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder="Add instructions, prompt details, and guidelines for students..."
                    rows="4"
                    className="mt-1.5 w-full rounded-md border border-[#dadce0] p-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Due date</span>
                  <input
                    type="datetime-local"
                    value={assignmentForm.dueDate}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] px-3 text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  />
                </label>

                <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-3.5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignmentForm.acceptLateSubmissions !== false}
                      onChange={(e) => setAssignmentForm((f) => ({ ...f, acceptLateSubmissions: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-[#dadce0] text-[#137333] focus:ring-[#137333]"
                    />
                    <div>
                      <span className="text-sm font-medium text-[#202124]">Allow late submissions</span>
                      <p className="mt-0.5 text-xs text-[#5f6368]">
                        If checked, students can turn in work after the deadline (marked as Late). If unchecked, late submissions are blocked once overdue.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#dadce0]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingAssignment(false);
                      setAssignmentForm(emptyAssignmentForm);
                    }}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAssignment}
                    className="rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white hover:bg-[#0f5b28] disabled:bg-gray-300"
                  >
                    {isSavingAssignment ? "Assigning..." : "Assign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activePage === "classrooms" && openedClassroomId && classrooms.some((c) => c.id === openedClassroomId) && (
          <ClassroomDetail
            key={openedClassroomId}
            classroom={classrooms.find((c) => c.id === openedClassroomId)}
            assignments={assignments}
            teacher={{ id: profile?.id, name: profile?.full_name || profile?.email || "Teacher", email: profile?.email || "" }}
            onBack={() => setOpenedClassroomId(null)}
            onOpenAssignment={(assignment) => {
              setAssignmentFilterClassroomId(openedClassroomId);
              setSelectedAssignmentId(assignment.id);
              setAssignmentDetailTab("roster");
              setActivePage("assignments");
            }}
            onCreateAssignment={() => {
              setAssignmentForm({ ...emptyAssignmentForm, classroomId: openedClassroomId });
              setIsCreatingAssignment(true);
            }}
            onToggleArchive={(classroomId, archive) => {
              const cl = classrooms.find((c) => String(c.id) === String(classroomId));
              setArchivingClassroom({
                id: classroomId,
                name: cl?.name || "Classroom",
                archive,
              });
            }}
            onCopyClassroom={handleOpenCopyModal}
            onExportCSV={handleExportClassroomCSV}
          />
        )}

        {/* Classes Page */}
        {activePage === "classrooms" && (!openedClassroomId || !classrooms.some((c) => c.id === openedClassroomId)) && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#dadce0] pb-5">
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-[#202124]">
                  Classes
                </h2>
                <p className="mt-1 text-sm text-[#5f6368]">
                  Manage your classes, share student join codes, and oversee assignments.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setClassroomForm(emptyClassroomForm);
                  setIsCreatingClassroom(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#0f5b28] active:scale-[0.98]"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Create class</span>
              </button>
            </div>

            {/* Active vs Archived Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-[#dadce0]">
              <button
                type="button"
                onClick={() => setClassroomTab("active")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                  classroomTab === "active"
                    ? "border-[#137333] text-[#137333] font-semibold"
                    : "border-transparent text-[#5f6368] hover:text-[#202124]"
                }`}
              >
                <span>Active classes</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    classroomTab === "active"
                      ? "bg-[#e6f4ea] text-[#137333]"
                      : "bg-[#f1f3f4] text-[#5f6368]"
                  }`}
                >
                  {activeClassrooms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setClassroomTab("archived")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                  classroomTab === "archived"
                    ? "border-amber-600 text-amber-800 font-semibold"
                    : "border-transparent text-[#5f6368] hover:text-[#202124]"
                }`}
              >
                <ArchiveIcon className="h-4 w-4" />
                <span>Archived classes</span>
                {archivedClassrooms.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {archivedClassrooms.length}
                  </span>
                )}
              </button>
            </div>

            {isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-64 rounded-xl border border-[#dadce0] bg-white animate-pulse" />
                ))}
              </div>
            ) : classroomTab === "active" && activeClassrooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-12 text-center max-w-md mx-auto my-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                  <DoorIcon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-[#202124]">No active classes</h3>
                <p className="mt-1 text-sm text-[#5f6368]">
                  {archivedClassrooms.length > 0
                    ? "All your classes are currently archived. Create a new class or restore one from the Archived classes tab."
                    : "Create a class to start posting assignments and tracking student submissions."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setClassroomForm(emptyClassroomForm);
                    setIsCreatingClassroom(true);
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0f5b28]"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Create class</span>
                </button>
              </div>
            ) : classroomTab === "archived" && archivedClassrooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-12 text-center max-w-md mx-auto my-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <ArchiveIcon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-[#202124]">No archived classes</h3>
                <p className="mt-1 text-sm text-[#5f6368]">
                  Classes you archive will be moved here in read-only mode. You can restore them to active at any time.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visibleClassrooms.map((classroom) => {
                  const creatorName = profile?.full_name || classroom.teacherName || "Teacher";
                  const creatorInitials = getInitials(creatorName, "PX");
                  const creatorTheme = getTeacherAvatarTheme(profile?.id || classroom.teacherId, profile?.avatarColor || "blue");
                  const creatorAvatarUrl = (classroom.teacherId === profile?.id || !classroom.teacherId) ? (profile?.avatarUrl || "") : "";

                  return (
                  <article
                    key={classroom.id}
                    className={`group flex flex-col rounded-xl border bg-white overflow-hidden shadow-2xs hover:shadow-md transition-shadow duration-200 ${
                      classroom.isArchived ? "border-amber-300 ring-1 ring-amber-200" : "border-[#dadce0]"
                    }`}
                  >
                    <div className={`relative h-32 p-4 text-white flex flex-col justify-between ${classroom.accent}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 pr-14">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3>
                              <button type="button" onClick={() => setOpenedClassroomId(classroom.id)}
                                className="text-left text-xl font-medium tracking-tight text-white hover:underline break-words"
                                title={classroom.name}>
                                {classroom.name}
                              </button>
                            </h3>
                            {classroom.isArchived && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-900/70 border border-amber-300/40 px-2 py-0.5 text-[11px] font-semibold text-amber-100 shadow-xs">
                                <ArchiveIcon className="h-3 w-3" />
                                Archived
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-normal text-white/90 truncate mt-0.5">
                            Section {classroom.section} {classroom.subject && classroom.subject !== classroom.name ? `• ${classroom.subject}` : ""}
                          </p>
                        </div>
                      </div>

                      <div
                        className="group/avatar absolute -bottom-6 right-4 z-10"
                        title={`Instructor & Classroom Creator: ${creatorName}`}
                      >
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr ${creatorTheme.bg} text-white text-lg font-bold shadow-md ring-4 ring-white transition-all duration-200 group-hover/avatar:scale-105 select-none overflow-hidden`}
                        >
                          {creatorAvatarUrl ? (
                            <img src={creatorAvatarUrl} alt={creatorName} className="h-full w-full object-cover" />
                          ) : (
                            creatorInitials
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-7 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 rounded-md bg-[#f8f9fa] border border-[#dadce0] px-2.5 py-1 text-xs text-[#3c4043]">
                            <span className="font-medium text-[#5f6368]">Code:</span>
                            <span className="font-mono font-bold">{classroom.code}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(classroom.code);
                                setSuccessMessage(`Class code ${classroom.code} copied!`);
                              }}
                              className="ml-1 text-[#5f6368] hover:text-[#137333]"
                              title="Copy class code"
                            >
                              <CopyIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <span className="text-xs text-[#5f6368]">
                            {classroom.students} {classroom.students === 1 ? "student" : "students"}
                          </span>
                        </div>

                        <p className="mt-3 text-xs text-[#5f6368]">
                          {classroom.assignments} assignments posted • {classroom.submissions} turned in
                        </p>

                        {classroom.isArchived && (
                          <div className="mt-2.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
                            Class is archived (read-only)
                          </div>
                        )}
                      </div>

                      <div>
                        {/* Quick Navigation Links */}
                        <div className="mt-4 pt-3 border-t border-[#e0e0e0] flex items-center justify-between text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentFilterClassroomId(classroom.id);
                              setSelectedAssignmentId(null);
                              setActivePage("assignments");
                            }}
                            className="inline-flex items-center gap-1 text-[#137333] hover:underline"
                          >
                            <ClipboardIcon className="h-3.5 w-3.5" />
                            <span>Classwork</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSubmissionsClassroomId(classroom.id);
                              setGradeSubject("all");
                              setSelectedSubmissionsAssignmentId("all");
                              setSelectedAssignmentId(null);
                              setActivePage("submissions");
                            }}
                            className="inline-flex items-center gap-1 text-[#5f6368] hover:text-[#202124]"
                          >
                            <FileSearchIcon className="h-3.5 w-3.5" />
                            <span>Gradebook</span>
                          </button>
                        </div>

                        {/* Actions Row */}
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenedClassroomId(classroom.id)}
                            className="font-medium text-[#137333] hover:underline shrink-0"
                          >
                            Open classroom
                          </button>

                          <div className="flex items-center gap-2">
                            {/* Copy Class Button (Google Classroom feature) */}
                            <button
                              type="button"
                              onClick={() => handleOpenCopyModal(classroom)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#5f6368] hover:text-[#137333] hover:underline"
                              title="Copy class for new term (duplicates assignments)"
                            >
                              <CopyIcon className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </button>

                            {/* Export CSV for archived classes */}
                            {classroom.isArchived && (
                              <button
                                type="button"
                                onClick={() => handleExportClassroomCSV(classroom)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#5f6368] hover:text-[#137333] hover:underline"
                                title="Export summary and grades to CSV"
                              >
                                <DownloadIcon className="h-3.5 w-3.5" />
                                <span>Export</span>
                              </button>
                            )}

                            {classroom.isArchived ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setArchivingClassroom({
                                    id: classroom.id,
                                    name: classroom.name,
                                    archive: false,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 hover:underline"
                                title="Restore classroom to active"
                              >
                                <UnarchiveIcon className="h-3.5 w-3.5" />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setArchivingClassroom({
                                    id: classroom.id,
                                    name: classroom.name,
                                    archive: true,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#5f6368] hover:text-amber-800 hover:underline"
                                title="Archive classroom"
                              >
                                <ArchiveIcon className="h-3.5 w-3.5" />
                                <span>Archive</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              </div>
            )}
          </div>
        )}

        {/* Classwork Page */}
        {activePage === "assignments" && (
          selectedAssignment ? (
            renderAssignmentDetailsAndSubmissions(() => setSelectedAssignmentId(null))
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#dadce0] pb-4 sm:pb-5">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-[#202124]">
                      Classwork
                    </h2>
                    <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-[#5f6368]">
                      Create and organize assignments, review student submissions, and grade work.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setAssignmentForm({
                          ...emptyAssignmentForm,
                          classroomId: activeClassrooms[0]?.id || "",
                        });
                        setIsCreatingAssignment(true);
                      }}
                      disabled={activeClassrooms.length === 0}
                      className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-[#137333] px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-white shadow-xs transition hover:bg-[#0f5b28] disabled:cursor-not-allowed disabled:bg-gray-300 active:scale-[0.98] shrink-0"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Create</span>
                    </button>

                    {classrooms.length > 0 && (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
                        <label htmlFor="section-filter" className="text-xs font-medium text-[#5f6368] shrink-0">
                          Section:
                        </label>
                        <select
                          id="section-filter"
                          value={assignmentFilterClassroomId}
                          onChange={(e) => setAssignmentFilterClassroomId(e.target.value)}
                          className="h-9 w-full sm:w-auto max-w-[170px] sm:max-w-[220px] rounded-lg border border-[#dadce0] bg-white px-2.5 sm:px-3 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] truncate"
                        >
                          <option value="all">All sections</option>
                          {classrooms.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — Section {c.section}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

              {filteredAssignments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-8 sm:p-12 text-center max-w-md mx-auto my-6 sm:my-8">
                  <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                    <ClipboardIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <h3 className="mt-4 text-base sm:text-lg font-medium text-[#202124]">No assignments yet</h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
                    {activeClassrooms.length === 0
                      ? archivedClassrooms.length > 0
                        ? "All your classes are currently archived. Restore or create an active class before creating assignments."
                        : "Create a class first before creating assignments."
                      : "Click + Create to post your first assignment for this section."}
                  </p>
                  {activeClassrooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignmentForm({
                          ...emptyAssignmentForm,
                          classroomId: activeClassrooms[0]?.id || "",
                        });
                        setIsCreatingAssignment(true);
                      }}
                      className="mt-4 sm:mt-5 inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#0f5b28]"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Create assignment</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAssignments.map((assignment) => (
                    <article
                      key={assignment.id}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className="group flex flex-col gap-3 rounded-2xl border border-[#dadce0] bg-white p-4 sm:p-5 transition-all hover:border-[#137333] hover:shadow-xs cursor-pointer"
                    >
                      {/* Card Top: Icon, Title, Section tag, and top-right Edit button */}
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
                          <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                            <ClipboardIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-medium text-[#202124] group-hover:text-[#137333] group-hover:underline truncate">
                              {assignment.title}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-[#f1f3f4] px-2 py-0.5 text-[11px] sm:text-xs font-medium text-[#3c4043]">
                                {assignment.classroomName} • Section {assignment.classroomSection}
                              </span>
                            </div>
                            {assignment.instructions && (
                              <p className="mt-1.5 text-xs text-[#5f6368] line-clamp-1 max-w-xl">
                                {assignment.instructions}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Top-right Edit button on mobile */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditAssignment(assignment);
                          }}
                          className="sm:hidden shrink-0 rounded-full p-2 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
                          title="Edit assignment"
                          aria-label="Edit assignment"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Card Bottom: Due Date, Turned in Badge, and Student Work Action */}
                      <div
                        className="mt-1 pt-3 border-t border-[#f1f3f4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-wrap">
                          <span className="text-xs text-[#5f6368]">
                            Due {formatDateTime(assignment.dueDate)}
                          </span>

                          <span className="rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-semibold text-[#137333]">
                            {assignment.submissions} turned in
                          </span>
                        </div>

                        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAssignment(assignment)}
                            className="hidden sm:inline-flex rounded-full p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
                            title="Edit assignment"
                            aria-label="Edit assignment"
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedAssignmentId(assignment.id)}
                            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-[#dadce0] px-4 py-1.5 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333] hover:text-[#137333]"
                          >
                            <span>Student work</span>
                            <span aria-hidden="true">→</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )
        )}

          {activePage === "upload" && (
            <div>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-[#137333]">
                      Manual check
                    </p>
                    <h2 className="mt-1 text-3xl sm:text-4xl font-black tracking-normal text-[#202124]">
                      Upload station
                    </h2>
                    <p className="mt-1 max-w-[680px] text-sm sm:text-base font-semibold leading-relaxed text-[#5f6368]">
                      Review student work from a photo, document, readable file, or pasted text.
                    </p>
                  </div>
                </div>

                {/* Interactive Filter & Scan Station Toolbar */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                  <div className="flex-1 rounded-xl border border-[#dadce0] bg-white p-3 shadow-2xs">
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(140px,1fr))]">
                      {/* 1. Search */}
                      <div className="relative block">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6368]" />
                        <input
                          type="search"
                          value={submissionHubSearch}
                          onChange={(event) => setSubmissionHubSearch(event.target.value)}
                          placeholder="Search assignment, subject, or class"
                          className="h-10 w-full rounded-lg border border-[#dadce0] bg-white pl-9 pr-8 text-xs sm:text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] placeholder:text-[#80868b]"
                        />
                        {submissionHubSearch && (
                          <button
                            type="button"
                            onClick={() => setSubmissionHubSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#202124] p-1 rounded-full hover:bg-gray-100"
                            title="Clear search"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>

                      {/* 2. All Classes Dropdown */}
                      <select
                        value={submissionHubClassroomId}
                        onChange={(event) => handleSelectScanClassroom(event.target.value)}
                        aria-label="Filter by class and section"
                        className="h-10 rounded-lg border border-[#dadce0] bg-white px-3 text-xs sm:text-sm font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                      >
                        <option value="all">All classes ({classrooms.length})</option>
                        {classrooms.map((classroom) => (
                          <option key={classroom.id} value={classroom.id}>
                            {classroom.name} — {classroom.section || "Standard"}
                          </option>
                        ))}
                      </select>

                      {/* 3. All Assignments Dropdown */}
                      <select
                        value={submissionHubFilter}
                        onChange={(event) => handleSelectScanAssignment(event.target.value)}
                        aria-label="Filter assignments"
                        className="h-10 rounded-lg border border-[#dadce0] bg-white px-3 text-xs sm:text-sm font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                      >
                        <option value="all">
                          {scanStationAssignments.length === 0
                            ? "No assignments"
                            : `All assignments (${scanStationAssignments.length})`}
                        </option>
                        {scanStationAssignments.map((assignment) => (
                          <option key={assignment.id} value={assignment.id}>
                            {assignment.title} ({assignment.classroomName || "Class"})
                          </option>
                        ))}
                      </select>

                      {/* 4. Sort Dropdown */}
                      <select
                        value={submissionHubSort}
                        onChange={(event) => setSubmissionHubSort(event.target.value)}
                        aria-label="Sort assignments"
                        className="h-10 rounded-lg border border-[#dadce0] bg-white px-3 text-xs sm:text-sm font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="dueDate">Due date</option>
                        <option value="title">Assignment name (A–Z)</option>
                        <option value="recentSubmissions">Most submissions</option>
                      </select>
                    </div>
                  </div>

                  {/* 5. Clear Station Button */}
                  <button
                    type="button"
                    onClick={handleResetManualCheck}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#dadce0] bg-white px-4 text-xs sm:text-sm font-semibold text-[#3c4043] transition hover:bg-[#f8f9fa] hover:text-[#202124] hover:border-[#c4c7c5] shadow-2xs active:scale-[0.98]"
                    title="Clear uploaded files, OCR text, and reset filters"
                  >
                    <svg className="h-4 w-4 text-[#5f6368]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Clear station</span>
                  </button>
                </div>

                {/* Linked Assignment Banner */}
                {selectedScanAssignment && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#c2e7ff] bg-[#f0f7ff] p-3.5 sm:px-4 shadow-2xs animate-fadeIn">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1967d2] text-white shadow-2xs">
                        <ClipboardIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded bg-[#d3e3fd] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#041e49]">
                            Linked Assignment
                          </span>
                          <span className="text-xs font-medium text-[#5f6368]">
                            {selectedScanAssignment.classroomName} • Section {selectedScanAssignment.classroomSection || "Standard"}
                          </span>
                        </div>
                        <h3 className="mt-0.5 truncate text-sm sm:text-base font-bold text-[#202124]">
                          {selectedScanAssignment.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-[#5f6368] bg-white border border-[#dadce0] px-3 py-1.5 rounded-lg shadow-2xs">
                        <span className="font-semibold text-[#202124]">
                          {selectedScanRoster.filter((r) => r.isSubmitted).length} / {selectedScanRoster.length}
                        </span>
                        <span>submitted</span>
                      </div>
                      {selectedScanAssignment.dueDate && (
                        <div className="text-xs text-[#5f6368] bg-white border border-[#dadce0] px-3 py-1.5 rounded-lg shadow-2xs">
                          <span>Due: {formatDateTime(selectedScanAssignment.dueDate)}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setSubmissionHubFilter("all")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1967d2] hover:text-[#041e49] hover:bg-[#d3e3fd]/40 px-2.5 py-1.5 rounded-lg transition"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6 lg:min-h-[720px]">
                {manualCheckResult ? (
                  <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 p-5 shadow-xs transition">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm overflow-hidden cursor-pointer group"
                          onClick={() => {
                            if (manualCheckImageUrl) setIsManualImageExpanded(true);
                          }}
                          title={manualCheckImageUrl ? "Click to expand image" : ""}
                        >
                          {manualCheckImageUrl ? (
                            <>
                              <img
                                src={manualCheckImageUrl}
                                alt="Submission thumbnail"
                                className="h-full w-full object-cover transition group-hover:scale-110"
                              />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                              </div>
                            </>
                          ) : uploadMode === "picture" ? (
                            <ImageIcon className="h-6 w-6" />
                          ) : (
                            <FileIcon className="h-6 w-6" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                              Analyzed Submission
                            </span>
                            {hasManualImageExtraction && (
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                                {transcriptionResult?.detectedLineCount || manualLiveOcrResult?.detectedLineCount || 26} lines OCR
                              </span>
                            )}
                            <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-gray-700 border border-emerald-100 shadow-2xs">
                              {manualCheckResult?.wordCount || (transcribedText || manualCheckText).split(/\s+/).filter(Boolean).length} words
                            </span>
                          </div>
                          <h4 className="truncate text-base font-black text-gray-950 mt-1">
                            {manualCheckTitle || manualCheckFiles[0]?.name || "Student Essay Submission"}
                          </h4>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                        {manualCheckImageUrl && (
                          <button
                            type="button"
                            onClick={() => setIsManualImageExpanded(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-extrabold text-emerald-800 hover:bg-emerald-50 transition shadow-2xs"
                            title="Open full view of the scanned essay image"
                          >
                            <ImageIcon className="h-3.5 w-3.5 text-emerald-700" />
                            <span>View image</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsEditingTranscript((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50 hover:text-gray-950 transition shadow-xs"
                        >
                          <span>{isEditingTranscript ? "Hide Editor" : "Edit & Re-scan"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetManualCheck}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 transition shadow-xs"
                        >
                          <PlusIcon className="h-4 w-4" />
                          <span>New Scan</span>
                        </button>
                      </div>
                    </div>

                    {isEditingTranscript && (
                      <form onSubmit={handleRunManualCheck} className="mt-4 border-t border-emerald-200/70 pt-4">
                        <label className="block text-xs font-black uppercase tracking-wider text-emerald-900 mb-2">
                          Edit transcript before re-scanning:
                        </label>
                        <textarea
                          value={uploadMode === "text" ? manualCheckText : transcribedText}
                          onChange={(e) => {
                            if (uploadMode === "text") {
                              setManualCheckText(e.target.value);
                            } else {
                              setTranscribedText(e.target.value);
                            }
                          }}
                          rows={6}
                          className="w-full rounded-lg border border-emerald-300 bg-white p-3 text-sm font-semibold leading-6 text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500">
                            Re-scanning will rerun Copyleaks plagiarism detection on the updated text.
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingTranscript(false)}
                              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-extrabold text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isScanningManualCheck}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 transition"
                            >
                              <FileSearchIcon className="h-4 w-4" />
                              <span>{isScanningManualCheck ? "Re-scanning..." : "Re-scan Plagiarism"}</span>
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <form
                    id="scan-station-form-top"
                    onSubmit={handleRunManualCheck}
                    className="flex min-h-[560px] flex-col rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6"
                  >
                    {loadedSubmissionInfo && (
                      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#137333] text-white shadow-xs">
                            <CheckIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[#137333]">
                                Auto-loaded Student Submission
                              </span>
                              <span className="rounded bg-[#e6f4ea] border border-[#ceead6] px-2 py-0.2 text-[10px] font-black text-[#137333]">
                                Active in station
                              </span>
                            </div>
                            <p className="text-sm font-bold text-[#202124] truncate">
                              {loadedSubmissionInfo.studentName} — {loadedSubmissionInfo.essayTitle}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              handleResetManualCheck();
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-xs font-semibold text-[#3c4043] transition hover:bg-[#f1f3f4] hover:text-[#202124] shadow-2xs"
                          >
                            <span>Clear station</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                    {uploadModes.map(({ id, label, icon: Icon }) => {
                      const isActive =
                        uploadMode === id;

                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setUploadMode(id);
                            setManualCheckResult(null);
                            setManualLiveOcrResult(null);
                            setManualCheckError("");
                          }}
                          className={
                            isActive
                              ? "flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-emerald-700 bg-white px-4 text-sm font-extrabold text-emerald-800 shadow-sm"
                              : "flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm font-extrabold text-gray-500 transition hover:border-emerald-300 hover:text-gray-950"
                          }
                        >
                          <span className={isActive ? "grid h-11 w-11 place-items-center rounded-lg bg-emerald-100 text-emerald-700" : "grid h-11 w-11 place-items-center rounded-lg bg-gray-100 text-gray-500"}>
                            <Icon className="h-5 w-5" />
                          </span>
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-6 block">
                    <span className="text-sm font-extrabold text-gray-800">
                      Check title
                    </span>
                    <input
                      type="text"
                      value={manualCheckTitle}
                      onChange={(event) => setManualCheckTitle(event.target.value)}
                      placeholder="Example: Grade 10 essay draft"
                      className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    />
                  </label>

                  <div className="mt-5 flex flex-1 flex-col">
                    {!uploadMode && (
                      <div className="grid flex-1 min-h-[320px] place-items-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 text-center">
                        <div>
                          <span className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                            <UploadIcon className="h-8 w-8" />
                          </span>
                          <h3 className="mt-5 text-xl font-black text-gray-950">
                            Choose a submission type first
                          </h3>
                          <p className="mt-2 max-w-[430px] text-sm font-semibold leading-6 text-gray-500">
                            Pick picture, file, or pasted text above to open the right submission box.
                          </p>
                        </div>
                      </div>
                    )}

                    {(uploadMode === "picture" || uploadMode === "file") && (
                      <>
                        {uploadMode === "picture" && (
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-700 text-white shadow-sm">
                                <SparklesIcon className="h-5 w-5" />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-extrabold text-emerald-950">
                                    AI Transcription Engine
                                  </h4>
                                  <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-900">
                                    Active
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-emerald-800">
                                  YOLO26x Line Detector (1024px Grayscale) + TrOCR Transformer (final_model)
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {ocrEngineInfo?.device && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-sm">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                  {ocrEngineInfo.device.toUpperCase()} Accelerated
                                </span>
                              )}
                              {manualCheckFiles.length === 0 && (
                                <button
                                  type="button"
                                  onClick={handleLoadSampleEssay}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-extrabold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
                                >
                                  <FileIcon className="h-3.5 w-3.5 text-emerald-600" />
                                  Try sample essay
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {uploadMode === "file" && manualCheckFiles.length > 0 ? (
                          <div className="flex flex-1 flex-col justify-between rounded-xl border-2 border-emerald-300 bg-white p-5 sm:p-6 shadow-sm">
                            <div className="space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4">
                                <div className="flex items-center gap-3.5 min-w-0">
                                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 shadow-2xs border border-emerald-200">
                                    <FileIcon className="h-7 w-7" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="rounded-md bg-emerald-700 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
                                        {getFileKind(manualCheckFiles[0])}
                                      </span>
                                      <span className="text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                        {formatFileSize(manualCheckFiles[0].size)}
                                      </span>
                                      {loadedSubmissionInfo && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">
                                          <CheckIcon className="h-3 w-3 text-[#137333]" />
                                          Auto-loaded from {loadedSubmissionInfo.studentName}
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="mt-1 text-base sm:text-lg font-black text-gray-950 truncate max-w-lg">
                                      {manualCheckFiles[0].name}
                                    </h4>
                                    <p className="text-xs text-[#5f6368] truncate">
                                      {loadedSubmissionInfo
                                        ? `Submission for ${loadedSubmissionInfo.assignmentTitle || "Assignment"} • Ready to scan`
                                        : "Attached file ready for plagiarism and originality verification"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-xs font-semibold text-[#3c4043] hover:bg-[#f1f3f4] transition shadow-2xs">
                                    <span>Change file</span>
                                    <input
                                      type="file"
                                      accept={ACCEPTED_CHECK_FILE_TYPES}
                                      multiple
                                      onChange={handleManualCheckFiles}
                                      className="sr-only"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualCheckFiles([]);
                                      setManualCheckText("");
                                    }}
                                    className="rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-xs font-semibold text-[#c5221f] hover:bg-red-50 hover:border-red-200 transition shadow-2xs"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>

                              {manualCheckText ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2 mb-2">
                                    <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                                      Loaded Document Text Content
                                    </span>
                                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                      {manualCheckText.split(/\s+/).filter(Boolean).length} words
                                    </span>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto font-mono text-xs leading-relaxed text-gray-800 whitespace-pre-wrap pr-1 bg-white p-3 rounded-lg border border-emerald-100">
                                    {manualCheckText.slice(0, 1200)}
                                    {manualCheckText.length > 1200 ? "..." : ""}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs font-semibold text-emerald-900">
                                  <SparklesIcon className="h-5 w-5 text-emerald-700 shrink-0" />
                                  <span>Student document is loaded automatically into the scan station. Click <strong>"Scan for plagiarism"</strong> below to run originality and Copyleaks checks.</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-[#5f6368]">
                              <span className="inline-flex items-center gap-1 font-medium">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Submission loaded automatically — no upload required
                              </span>
                              <span className="font-semibold text-emerald-800">Ready to scan</span>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-1 min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 text-center transition hover:border-emerald-600 hover:bg-emerald-50">
                            {manualImagePreview ? (
                              <div className="flex w-full flex-col items-center py-4">
                                {loadedSubmissionInfo && (
                                  <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-3 py-1 text-xs font-bold text-[#137333]">
                                    <CheckIcon className="h-3.5 w-3.5 text-[#137333]" />
                                    Auto-loaded from {loadedSubmissionInfo.studentName}'s handwriting
                                  </div>
                                )}
                                <img
                                  src={manualImagePreview}
                                  alt="Manual check preview"
                                  className="max-h-[300px] w-full rounded-lg object-contain"
                                />
                                <p className="mt-3 text-xs font-bold text-gray-500">
                                  Click or drop another image to replace
                                </p>
                              </div>
                            ) : (
                              <>
                                <span className="grid h-20 w-20 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                                  {uploadMode === "picture" ? (
                                    <ImageIcon className="h-10 w-10" />
                                  ) : (
                                    <UploadIcon className="h-10 w-10" />
                                  )}
                                </span>
                                <span className="mt-6 text-2xl font-black text-gray-950">
                                  {uploadMode === "picture" ? "Upload student handwriting" : "Upload a file"}
                                </span>
                                <span className="mt-2 max-w-[520px] text-sm font-semibold leading-6 text-gray-500">
                                  {uploadMode === "picture"
                                    ? "Select a PNG, JPG, JPEG, or WEBP photo of handwritten student work to transcribe."
                                    : "Select a PDF, DOCX, TXT, MD, CSV, JSON, or other supported classroom file."}
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept={
                                uploadMode === "picture"
                                  ? "image/png,image/jpeg,image/jpg,image/webp"
                                  : ACCEPTED_CHECK_FILE_TYPES
                              }
                              multiple
                              onChange={handleManualCheckFiles}
                              className="sr-only"
                            />
                          </label>
                        )}

                        {uploadMode === "picture" && manualCheckFiles.length > 0 && (
                          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                            <button
                              type="button"
                              disabled={isTranscribing || isScanningManualCheck}
                              onClick={() => handleTranscribePicture()}
                              className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                            >
                              <SparklesIcon className="h-4 w-4" />
                              {isTranscribing
                                ? `Transcribing with YOLO + TrOCR (${manualLiveOcrResult?.processedLineCount || 0}/${manualLiveOcrResult?.detectedLineCount || "?"} lines)...`
                                : transcribedText
                                  ? "Re-transcribe handwriting"
                                  : "Transcribe handwriting"}
                            </button>

                            {transcribedText && (
                              <button
                                type="button"
                                onClick={() => handleCopyTranscript()}
                                className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm font-extrabold text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
                              >
                                {copySuccess ? (
                                  <>
                                    <CheckIcon className="h-4 w-4 text-emerald-600" />
                                    <span className="text-emerald-700">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <CopyIcon className="h-4 w-4 text-gray-500" />
                                    <span>Copy transcript</span>
                                  </>
                                )}
                              </button>
                            )}

                            {transcribedText && (
                              <button
                                type="button"
                                onClick={handleTransferToText}
                                className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-extrabold text-gray-700 transition hover:bg-gray-50 hover:text-gray-950"
                              >
                                <ClipboardIcon className="h-4 w-4 text-gray-500" />
                                Edit in Paste tab
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setManualCheckFiles([]);
                                setManualImagePreview("");
                                setTranscribedText("");
                                setTranscriptionResult(null);
                                setManualLiveOcrResult(null);
                                setShowLineBreakdown(false);
                              }}
                              className="ml-auto text-xs font-extrabold text-gray-500 hover:text-red-600 transition"
                            >
                              Remove image
                            </button>
                          </div>
                        )}

                        {uploadMode === "picture" && (isTranscribing || transcribedText || manualLiveOcrResult?.text) && (
                          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-100 text-emerald-700">
                                  <SparklesIcon className="h-4 w-4" />
                                </span>
                                <h4 className="text-sm font-black text-gray-950">
                                  Transcribed Handwriting
                                </h4>
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                                  {transcriptionResult?.detectedLineCount || manualLiveOcrResult?.detectedLineCount || 0} lines detected
                                </span>
                                {transcribedText && (
                                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
                                    {transcribedText.split(/\s+/).filter(Boolean).length} words
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowLineBreakdown((prev) => !prev)}
                                  className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 hover:text-emerald-900"
                                >
                                  <span>{showLineBreakdown ? "Hide line boxes" : "Show line breakdown"}</span>
                                  <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showLineBreakdown ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </div>

                            {isTranscribing && (
                              <div className="mt-3 space-y-1.5">
                                <div className="flex justify-between text-xs font-bold text-emerald-800">
                                  <span>
                                    {manualLiveOcrResult?.detectedLineCount
                                      ? `Transcribing line crops with TrOCR (${manualLiveOcrResult.processedLineCount}/${manualLiveOcrResult.detectedLineCount})...`
                                      : "Detecting handwriting line boxes with YOLO26x..."}
                                  </span>
                                  <span>
                                    {manualLiveOcrResult?.detectedLineCount
                                      ? `${Math.round(((manualLiveOcrResult.processedLineCount || 0) / manualLiveOcrResult.detectedLineCount) * 100)}%`
                                      : "Processing..."}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                                  <div
                                    className="h-full bg-emerald-600 transition-all duration-300"
                                    style={{
                                      width: manualLiveOcrResult?.detectedLineCount
                                        ? `${Math.max(8, Math.round(((manualLiveOcrResult.processedLineCount || 0) / manualLiveOcrResult.detectedLineCount) * 100))}%`
                                        : "20%",
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="mt-3">
                              <label className="block text-xs font-bold text-gray-500 mb-1">
                                {isTranscribing ? "Live streaming recognition:" : "Editable transcript (refine words before scanning if needed):"}
                              </label>
                              <textarea
                                value={transcribedText || manualLiveOcrText}
                                onChange={(e) => setTranscribedText(e.target.value)}
                                rows={Math.min(10, Math.max(5, (transcribedText || manualLiveOcrText).split("\n").length + 1))}
                                placeholder="Transcribed handwritten essay text will appear here as YOLO and TrOCR process the image..."
                                className="w-full rounded-lg border border-emerald-200 bg-white p-3 text-sm font-semibold leading-6 text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                              />
                            </div>

                            {showLineBreakdown && (transcriptionResult?.lines?.length > 0 || manualLiveOcrResult?.lines?.length > 0) && (
                              <div className="mt-4 border-t border-emerald-100 pt-3">
                                <h5 className="text-xs font-black uppercase tracking-wider text-emerald-900 mb-2">
                                  Line-by-Line Detection & Transcription
                                </h5>
                                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                                  {(transcriptionResult?.lines || manualLiveOcrResult?.lines || []).map((line, idx) => {
                                    const box = (transcriptionResult?.boxes || manualLiveOcrResult?.boxes || [])[idx];
                                    return (
                                      <div key={idx} className="flex items-start gap-2 rounded bg-white p-2 text-xs border border-emerald-100">
                                        <span className="font-mono font-black text-emerald-700 min-w-[28px]">
                                          #{idx + 1}
                                        </span>
                                        <span className="flex-1 font-semibold text-gray-800">
                                          {line}
                                        </span>
                                        {box && (
                                          <span className="font-mono text-[10px] text-gray-400">
                                            [{Math.round(box.x1)}, {Math.round(box.y1)}, {Math.round(box.x2)}, {Math.round(box.y2)}]
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {manualCheckFiles.length > 0 && uploadMode !== "file" && (
                          <div className="mt-5 rounded-lg border border-gray-200 bg-white">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 px-4 py-3 text-xs font-extrabold uppercase tracking-normal text-gray-500">
                              <span>File</span>
                              <span>Type</span>
                              <span>Size</span>
                            </div>

                            {manualCheckFiles.map((file) => (
                              <div
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                                className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0"
                              >
                                <span className="min-w-0 truncate font-extrabold text-gray-950">
                                  {file.name}
                                </span>
                                <span className="font-bold text-gray-500">
                                  {getFileKind(file)}
                                </span>
                                <span className="font-bold text-gray-500">
                                  {formatFileSize(file.size)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {uploadMode === "text" && (
                      <label className="flex flex-1 flex-col">
                        <span className="text-sm font-extrabold text-gray-800">
                          Paste text
                        </span>
                        <textarea
                          value={manualCheckText}
                          onChange={(event) => {
                            setManualCheckText(event.target.value);
                            setManualCheckResult(null);
                            setManualLiveOcrResult(null);
                          }}
                          placeholder="Paste essay text, copied paragraphs, or OCR output here."
                          className="mt-2 flex-1 min-h-[360px] w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm font-semibold leading-6 outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                        />
                      </label>
                    )}
                  </div>

                  {manualCheckError && (
                    <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      {manualCheckError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isScanningManualCheck || isTranscribing || !uploadMode}
                    className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-base font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    <FileSearchIcon className="h-5 w-5" />
                    {isScanningManualCheck
                      ? "Scanning submission..."
                      : isTranscribing
                        ? "Transcribing handwriting..."
                        : transcribedText
                          ? "Scan transcribed essay for plagiarism"
                          : "Scan for plagiarism"}
                  </button>
                </form>
                )}

                {(isScanningManualCheck || manualCheckResult) && (
                <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-extrabold uppercase tracking-normal text-emerald-700">
                        Detection result
                      </p>
                      <h3 className="mt-2 text-2xl font-black">
                        {isScanningManualCheck
                          ? "Scanning submission"
                          : manualCheckResult?.title || "Ready to scan"}
                      </h3>
                    </div>

                    {manualCheckResult && (
                      <span className={`rounded-lg px-3 py-2 text-sm font-black ${manualResultBadgeClass}`}>
                        {manualCheckResult.label}
                      </span>
                    )}
                  </div>

                  {isScanningManualCheck ? (
                    <div className="mt-8 rounded-lg border border-emerald-100 bg-emerald-50 px-5 py-5">
                      {isTranscribing || (!plagiarismScanProgressText && manualLiveOcrResult) ? (
                        <>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-extrabold text-emerald-800">
                                Detecting text...
                              </p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">
                                YOLO has detected the line crops. TrOCR text appears here as each batch finishes.
                              </p>
                            </div>

                            {manualLiveOcrResult && (
                              <span className="rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-800">
                                {manualLiveOcrResult.processedLineCount}/{manualLiveOcrResult.detectedLineCount} lines
                              </span>
                            )}
                          </div>

                          <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold leading-6 text-gray-800">
                            {manualLiveOcrText || "Waiting for the first recognized line..."}
                          </pre>
                        </>
                      ) : (
                        <div className="flex items-center gap-3 py-3">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent shrink-0" />
                          <div>
                            <p className="text-sm font-extrabold text-emerald-950">
                              {plagiarismScanProgressText || "Scanning submission with Copyleaks..."}
                            </p>
                            <p className="text-xs font-semibold text-emerald-700 mt-1">
                              Connecting securely to Copyleaks Authenticity API & database matching.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : manualCheckResult ? (
                    <>
                      {/* 1. Score Box & 2x2 Stats Grid FIRST */}
                      <div className="mt-7 grid gap-4 sm:grid-cols-[160px_1fr]">
                        <div className={`grid aspect-square place-items-center rounded-lg bg-white text-center ring-8 ${manualResultRingClass}`}>
                          <div>
                            <strong className="block text-5xl font-black">
                              {manualCheckResult.score}%
                            </strong>
                            <span className="mt-1 block text-xs font-extrabold uppercase tracking-normal text-gray-500">
                              Plagiarism score
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {manualCheckResult.wordCount}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Total words
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {manualCheckResult.identicalWords ?? 0}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Matched / identical words
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-emerald-800">
                              {manualCheckResult.scanStatus || "Completed"}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Scan status
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {manualCheckResult.matchedSources?.filter(s => !s.url?.includes("wikipedia.org")).length ?? 0}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Matching sources
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 2. Original Scanned Image & Transcribed Handwriting Section */}
                      <div className="mt-7">
                        {manualCheckImageUrl ? (
                          <div className="grid gap-6 lg:grid-cols-2">
                            {/* Left Column: Original Scanned Image */}
                            <div className="flex flex-col">
                              <div className="flex items-center justify-between pb-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-black text-gray-900">
                                    Original essay image
                                  </p>
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                                    Handwriting photo
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsManualImageExpanded(true)}
                                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:text-emerald-900 transition"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l-5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                  <span>Click to expand</span>
                                </button>
                              </div>

                              <div
                                className="group relative flex flex-1 min-h-[360px] max-h-[520px] cursor-zoom-in items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50/80 shadow-xs transition hover:border-emerald-500 hover:bg-gray-100/50"
                                onClick={() => setIsManualImageExpanded(true)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && setIsManualImageExpanded(true)}
                                title="Click to view full screen"
                              >
                                <img
                                  src={manualCheckImageUrl}
                                  alt="Original essay submission"
                                  className="max-h-[500px] w-full object-contain p-2 transition duration-200 group-hover:scale-[1.01]"
                                />
                                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l-5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                  Expand
                                </div>
                              </div>
                            </div>

                            {/* Right Column: Transcribed Text & Plagiarism Highlights */}
                            <div className="flex flex-col">
                              <div className="flex items-center justify-between pb-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-black text-gray-900">
                                    Transcribed student handwriting
                                  </p>
                                  {hasManualImageExtraction && (
                                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                                      YOLO26x + TrOCR
                                    </span>
                                  )}
                                </div>
                                {(manualDetectedText || transcribedText || manualCheckText) && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyTranscript(manualDetectedText || transcribedText || manualCheckText)}
                                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:text-emerald-900 transition"
                                  >
                                    {copySuccess ? (
                                      <>
                                        <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                                        <span>Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <CopyIcon className="h-3.5 w-3.5" />
                                        <span>Copy text</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              {manualImageExtractionSummary.length > 0 && (
                                <div className="mb-3 space-y-2">
                                  {manualImageExtractionSummary.map((summary) => (
                                    <p
                                      key={summary}
                                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
                                    >
                                      {summary}
                                    </p>
                                  ))}
                                </div>
                              )}
                              <div className="flex-1">
                                <HighlightedText text={manualDetectedText || transcribedText || manualCheckText} scanResult={manualCheckResult} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between pb-3">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black text-gray-900">
                                  {hasManualImageExtraction ? "Transcribed student handwriting" : "Analyzed essay text"}
                                </p>
                                {hasManualImageExtraction && (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                                    YOLO26x + TrOCR
                                  </span>
                                )}
                              </div>
                              {(manualDetectedText || transcribedText || manualCheckText) && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyTranscript(manualDetectedText || transcribedText || manualCheckText)}
                                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:text-emerald-900 transition"
                                >
                                  {copySuccess ? (
                                    <>
                                      <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <CopyIcon className="h-3.5 w-3.5" />
                                      <span>Copy text</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            {manualImageExtractionSummary.length > 0 && (
                              <div className="mb-3 space-y-2">
                                {manualImageExtractionSummary.map((summary) => (
                                  <p
                                    key={summary}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
                                  >
                                    {summary}
                                  </p>
                                ))}
                              </div>
                            )}
                            <HighlightedText text={manualDetectedText || transcribedText || manualCheckText} scanResult={manualCheckResult} />
                          </div>
                        )}
                      </div>

                      {manualCheckResult.matchedSources && manualCheckResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).length > 0 && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-extrabold text-gray-800">
                              Matching sources ({manualCheckResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).length})
                            </p>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                              Copyleaks Database
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {manualCheckResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).map((source, sIdx) => (
                              <div
                                key={source.id || sIdx}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-extrabold text-gray-900 truncate">
                                      {source.title || "Matched source"}
                                    </p>
                                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      {source.source_type || "Copyleaks Database"}
                                    </span>
                                  </div>
                                  {source.url && (
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-emerald-700 hover:underline truncate block mt-0.5"
                                    >
                                      {source.url}
                                    </a>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  <span className="rounded bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                                    {source.matched_words || source.identical_words || 0} matched words
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="mt-6 text-sm font-semibold leading-6 text-gray-600">
                        {manualCheckResult.summary}
                      </p>

                      <div className="mt-6">
                        <p className="text-sm font-extrabold text-gray-800">
                          Review signals
                        </p>
                        <div className="mt-3 space-y-2">
                          {manualCheckResult.flags.map((flag) => (
                            <p
                              key={flag}
                              className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600"
                            >
                              {flag}
                            </p>
                          ))}
                        </div>
                      </div>

                      {manualCheckResult.repeatedPhrases.length > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-extrabold text-gray-800">
                            Repeated phrases
                          </p>
                          <div className="mt-3 space-y-2">
                            {manualCheckResult.repeatedPhrases.map((item) => (
                              <p
                                key={item.phrase}
                                className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-semibold leading-6 text-gray-600"
                              >
                                "{item.phrase}" appears {item.count} times
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </section>
                )}
              </div>

              {/* Linked Assignment Submissions Roster */}
              {selectedScanAssignment && (
                <div className="mt-8 rounded-2xl border border-[#dadce0] bg-white p-4 sm:p-6 shadow-2xs animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#dadce0] pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e6f4ea] text-[#137333]">
                          <UsersIcon className="h-4 w-4" />
                        </span>
                        <h3 className="text-base sm:text-lg font-bold text-[#202124]">
                          Student Submissions & Roster
                        </h3>
                      </div>
                      <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
                        Enrolled students in {selectedScanAssignment.classroomName} • Section {selectedScanAssignment.classroomSection || "Standard"}
                      </p>
                    </div>

                    {/* Stats pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-[#f1f3f4] px-3 py-1 text-xs font-semibold text-[#3c4043]">
                        {selectedScanRoster.length} students
                      </span>
                      <span className="rounded-full bg-[#e8f0fe] px-3 py-1 text-xs font-semibold text-[#1967d2]">
                        {selectedScanRoster.filter((r) => r.isSubmitted && !r.isGraded).length} turned in
                      </span>
                      <span className="rounded-full bg-[#e6f4ea] px-3 py-1 text-xs font-semibold text-[#137333]">
                        {selectedScanRoster.filter((r) => r.isGraded).length} graded
                      </span>
                      {selectedScanRoster.filter((r) => !r.isSubmitted).length > 0 && (
                        <span className="rounded-full bg-[#fef7e0] px-3 py-1 text-xs font-semibold text-[#b06000]">
                          {selectedScanRoster.filter((r) => !r.isSubmitted).length} missing
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Filter tabs and student search */}
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {[
                        { id: "all", label: "All", count: selectedScanRoster.length },
                        { id: "submitted", label: "Turned In", count: selectedScanRoster.filter((r) => r.isSubmitted && !r.isGraded).length },
                        { id: "graded", label: "Graded", count: selectedScanRoster.filter((r) => r.isGraded).length },
                        { id: "missing", label: "Missing", count: selectedScanRoster.filter((r) => !r.isSubmitted).length },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setScanRosterFilter(tab.id)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            scanRosterFilter === tab.id
                              ? "bg-[#137333] text-white shadow-2xs"
                              : "bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8eaed] hover:text-[#202124]"
                          }`}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-[200px] sm:max-w-xs">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5f6368]" />
                      <input
                        type="search"
                        value={scanRosterSearch}
                        onChange={(e) => setScanRosterSearch(e.target.value)}
                        placeholder="Search student or essay..."
                        className="h-8 w-full rounded-lg border border-[#dadce0] bg-white pl-8 pr-3 text-xs text-[#202124] outline-none transition focus:border-[#137333] focus:ring-1 focus:ring-[#e6f4ea]"
                      />
                    </div>
                  </div>

                  {/* Roster table / list */}
                  <div className="mt-4 divide-y divide-[#f1f3f4] overflow-hidden rounded-xl border border-[#dadce0]">
                    {filteredScanRoster.length === 0 ? (
                      <div className="p-8 text-center text-xs sm:text-sm text-[#5f6368]">
                        No students found matching this criteria.
                      </div>
                    ) : (
                      filteredScanRoster.map((item) => {
                        const initials = item.studentName
                          .split(" ")
                          .map((n) => n[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "S";

                        return (
                          <div
                            key={item.studentId}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 hover:bg-[#f8f9fa] transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-xs font-bold text-[#1967d2]">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-[#202124] truncate">
                                    {item.studentName}
                                  </p>
                                  {item.isGraded ? (
                                    <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                                      Graded: {item.grade}/100
                                    </span>
                                  ) : item.isSubmitted ? (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      item.status === "late"
                                        ? "bg-[#fef7e0] text-[#b06000]"
                                        : "bg-[#e8f0fe] text-[#1967d2]"
                                    }`}>
                                      {item.status === "late" ? "Turned in late" : "Turned in"}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] font-medium text-[#5f6368]">
                                      Missing
                                    </span>
                                  )}
                                  {item.scanResult && (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      (item.scanResult.plagiarism_score ?? item.scanResult.score ?? 0) >= 50
                                        ? "bg-red-50 text-red-700"
                                        : (item.scanResult.plagiarism_score ?? item.scanResult.score ?? 0) >= 20
                                          ? "bg-amber-50 text-amber-700"
                                          : "bg-emerald-50 text-emerald-700"
                                    }`}>
                                      {Math.round(item.scanResult.plagiarism_score ?? item.scanResult.score ?? 0)}% similarity
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#5f6368] truncate">
                                  {item.studentEmail || (item.essayTitle ? `Essay: ${item.essayTitle}` : "No email")}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.isSubmitted ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={loadingSubmissionId === item.submission?.id}
                                    onClick={() => handleLoadSubmissionToScanStation(item.submission)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#3c4043] transition hover:bg-[#f1f3f4] hover:text-[#202124] shadow-2xs disabled:opacity-60"
                                    title="Load student file/essay automatically into Scan station"
                                  >
                                    {loadingSubmissionId === item.submission?.id ? (
                                      <>
                                        <span className="h-3.5 w-3.5 border-2 border-[#137333] border-t-transparent rounded-full animate-spin shrink-0" />
                                        <span>Loading...</span>
                                      </>
                                    ) : (
                                      <>
                                        <UploadIcon className="h-3.5 w-3.5 text-[#5f6368]" />
                                        <span>Load in Scan Station</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReview(item.submission)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#137333] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f5b28] shadow-2xs"
                                  >
                                    <EditIcon className="h-3.5 w-3.5" />
                                    <span>{item.isGraded ? "Edit Grade" : "Review & Grade"}</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-[#80868b] italic">
                                  Awaiting submission
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activePage === "submissions" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#dadce0] pb-4 sm:pb-5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-[#202124]">
                    Grades & Submissions
                  </h2>
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-[#5f6368]">
                    Review student work, check originality scores, and grade submissions organized by section.
                  </p>
                </div>
              </div>

              {/* Google Classroom Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dadce0] bg-white p-3.5 sm:p-4 shadow-2xs">
                <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap flex-1 min-w-0">
                  {/* Subject filter */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-subject" className="text-xs font-medium text-[#5f6368] shrink-0">
                      Subject:
                    </label>
                    <select
                      id="filter-subject"
                      value={gradeSubject}
                      onChange={(event) => {
                        setGradeSubject(event.target.value);
                        setSelectedSubmissionsClassroomId("all");
                        setSelectedSubmissionsAssignmentId("all");
                        setSelectedAssignmentId(null);
                      }}
                      className="h-9 rounded-lg border border-[#dadce0] bg-[#fafafa] hover:bg-white px-2.5 sm:px-3 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] max-w-[150px] sm:max-w-[180px] truncate"
                    >
                      <option value="all">All subjects</option>
                      {gradeSubjects.map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </div>

                  {/* Classroom filter */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-classroom" className="text-xs font-medium text-[#5f6368] shrink-0">
                      Class:
                    </label>
                    <select
                      id="filter-classroom"
                      value={selectedSubmissionsClassroomId}
                      onChange={(event) => {
                        setSelectedSubmissionsClassroomId(event.target.value);
                        setSelectedSubmissionsAssignmentId("all");
                        setSelectedAssignmentId(null);
                      }}
                      className="h-9 rounded-lg border border-[#dadce0] bg-[#fafafa] hover:bg-white px-2.5 sm:px-3 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] max-w-[180px] sm:max-w-[220px] truncate"
                    >
                      <option value="all">All classrooms</option>
                      {classrooms
                        .filter((c) => gradeSubject === "all" || (c.subject && c.subject !== "No subject" ? c.subject : c.name) === gradeSubject)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name} • Section {c.section}</option>
                        ))}
                    </select>
                  </div>

                  {/* Classwork filter */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-classwork" className="text-xs font-medium text-[#5f6368] shrink-0">
                      Assignment:
                    </label>
                    <select
                      id="filter-classwork"
                      value={selectedSubmissionsAssignmentId}
                      onChange={(event) => {
                        setSelectedSubmissionsAssignmentId(event.target.value);
                        setSelectedAssignmentId(null);
                      }}
                      className="h-9 rounded-lg border border-[#dadce0] bg-[#fafafa] hover:bg-white px-2.5 sm:px-3 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] max-w-[200px] sm:max-w-[240px] truncate"
                    >
                      <option value="all">All assignments</option>
                      {gradeClasswork.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} • {a.classroomName} ({a.classroomSection})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(gradeSubject !== "all" || selectedSubmissionsClassroomId !== "all" || selectedSubmissionsAssignmentId !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setGradeSubject("all");
                      setSelectedSubmissionsClassroomId("all");
                      setSelectedSubmissionsAssignmentId("all");
                      setSelectedAssignmentId(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#137333] hover:bg-[#e6f4ea] px-3 py-1.5 rounded-full transition shrink-0"
                  >
                    <span>✕</span>
                    <span>Reset filters</span>
                  </button>
                )}
              </div>

              {selectedAssignment ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-[#dadce0] bg-white p-3.5 sm:p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedAssignmentId(null)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333] hover:text-[#137333]"
                      >
                        <span aria-hidden="true">←</span>
                        <span>All assignments</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="hidden sm:inline text-xs font-medium text-[#5f6368]">
                          Section:
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[#e6f4ea] px-3 py-0.5 text-xs font-semibold text-[#137333]">
                          {selectedAssignment.classroomName} • Section {selectedAssignment.classroomSection || "Standard"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-[#5f6368]">
                        <span className="hidden md:inline">Switch:</span>
                        <select
                          value={selectedAssignment.id}
                          onChange={(e) => setSelectedAssignmentId(e.target.value)}
                          className="h-9 max-w-[200px] sm:max-w-[260px] rounded-lg border border-[#dadce0] bg-white px-2.5 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] truncate"
                        >
                          {gradeClasswork
                            .filter(
                              (a) =>
                                selectedSubmissionsAssignmentId === "all" ||
                                String(a.id) === String(selectedSubmissionsAssignmentId) ||
                                a.id === selectedAssignment.id
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.title} • {a.classroomName} ({a.classroomSection || "Standard"})
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  {renderAssignmentDetailsAndSubmissions(() => setSelectedAssignmentId(null))}
                </div>
              ) : (
                <div className="space-y-6">
                  {assignments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dadce0] bg-white p-8 sm:p-12 text-center max-w-md mx-auto my-6">
                      <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                        <ClipboardIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                      </div>
                      <h3 className="mt-4 text-base sm:text-lg font-medium text-[#202124]">No assignments found</h3>
                      <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
                        Create an assignment first to begin tracking student submissions and assigning grades.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActivePage("assignments")}
                        className="mt-4 sm:mt-5 inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#0f5b28] transition"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Create assignment</span>
                      </button>
                    </div>
                  ) : submissionHubGroups.size === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dadce0] bg-white p-10 text-center max-w-md mx-auto my-6">
                      <p className="text-sm font-medium text-[#202124]">No assignments match these filters.</p>
                      <p className="mt-1 text-xs text-[#5f6368]">Try selecting another subject, classroom, or classwork option.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Array.from(submissionHubGroups.values()).map((group) => (
                        <section key={group.id} className="rounded-2xl border border-[#dadce0] bg-white overflow-hidden shadow-2xs">
                          {/* Group Header Strip */}
                          <div className="flex items-center justify-between border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#137333] text-white shadow-2xs">
                                <ClipboardIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm sm:text-base font-semibold text-[#202124] truncate">
                                    {group.name}
                                  </h3>
                                  <span className="rounded-full bg-white border border-[#dadce0] px-2.5 py-0.5 text-[11px] font-medium text-[#3c4043]">
                                    Section {group.section || "Standard"}
                                  </span>
                                  {group.subject && (
                                    <span className="text-xs text-[#5f6368] hidden sm:inline">
                                      • {group.subject}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium text-[#5f6368] shrink-0">
                              {group.assignments.length} {group.assignments.length === 1 ? "assignment" : "assignments"}
                            </span>
                          </div>

                          {/* Assignment Cards inside the Group */}
                          <div className="divide-y divide-[#f1f3f4] p-2 sm:p-3">
                            {group.assignments.map((assignment) => (
                              <article
                                key={assignment.id}
                                className="group flex flex-col gap-3 rounded-xl p-3 sm:p-4 transition hover:bg-[#f8f9fa] cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                                onClick={() => setSelectedAssignmentId(assignment.id)}
                              >
                                <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333] mt-0.5">
                                    <ClipboardIcon className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm sm:text-base font-medium text-[#202124] group-hover:text-[#137333] group-hover:underline truncate">
                                      {assignment.title}
                                    </h4>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5f6368]">
                                      <span>Due {formatDateTime(assignment.dueDate)}</span>
                                      {assignment.instructions && (
                                        <>
                                          <span aria-hidden="true">•</span>
                                          <span className="truncate max-w-xs">{assignment.instructions}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t border-[#f1f3f4] sm:border-t-0"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-semibold text-[#137333]">
                                      {assignment.submissionStats.submitted} turned in
                                    </span>
                                    <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-xs font-medium text-[#5f6368]">
                                      {assignment.submissionStats.missing} missing
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setAssignmentDetailTab("roster");
                                      setSelectedAssignmentId(assignment.id);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-[#137333] hover:bg-[#0f5b28] text-white px-3.5 py-1.5 text-xs font-medium transition shadow-2xs active:scale-[0.98]"
                                  >
                                    <span>Review work</span>
                                    <span aria-hidden="true">→</span>
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit Assignment Modal Dialog */}
          {editingAssignment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                <div className="sticky -top-6 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white py-4">
                  <div>
                    <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 uppercase tracking-wider">
                      Edit Assignment
                    </span>
                    <h3 className="mt-1.5 text-2xl font-black text-gray-950">
                      Update details
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseEditAssignment}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleUpdateAssignment} className="mt-5 space-y-4">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Classroom
                    </span>
                    <select
                      value={editingAssignment.classroomId}
                      onChange={(e) =>
                        setEditingAssignment((prev) => ({
                          ...prev,
                          classroomId: e.target.value,
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      required
                    >
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Title
                    </span>
                    <input
                      type="text"
                      value={editingAssignment.title}
                      onChange={(e) =>
                        setEditingAssignment((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Instructions
                    </span>
                    <textarea
                      value={editingAssignment.instructions}
                      onChange={(e) =>
                        setEditingAssignment((prev) => ({
                          ...prev,
                          instructions: e.target.value,
                        }))
                      }
                      rows="4"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 p-3 text-sm font-semibold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Due date
                    </span>
                    <input
                      type="datetime-local"
                      value={editingAssignment.dueDate}
                      onChange={(e) =>
                        setEditingAssignment((prev) => ({
                          ...prev,
                          dueDate: e.target.value,
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    />
                  </label>

                  <div className="mt-4 rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-3.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingAssignment.acceptLateSubmissions !== false}
                        onChange={(e) =>
                          setEditingAssignment((prev) => ({
                            ...prev,
                            acceptLateSubmissions: e.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-[#dadce0] text-[#137333] focus:ring-[#137333]"
                      />
                      <div>
                        <span className="text-sm font-medium text-[#202124]">Allow late submissions</span>
                        <p className="mt-0.5 text-xs text-[#5f6368]">
                          If checked, students can turn in work after the deadline (marked as Late). If unchecked, late submissions are blocked once overdue.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseEditAssignment}
                      className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-extrabold text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingAssignment}
                      className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-extrabold text-white transition hover:bg-emerald-800 disabled:bg-emerald-400 shadow-sm"
                    >
                      {isUpdatingAssignment ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {reviewingSubmission && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
              <div className="relative max-h-[92vh] w-full max-w-4xl lg:max-w-5xl overflow-y-auto overflow-x-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                  <div>
                    <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 uppercase tracking-wider">
                      Review Student Work
                    </span>
                    <h3 className="mt-1.5 text-2xl font-black text-gray-950">
                      {reviewingSubmission.essayTitle}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-gray-500">
                      Student: <strong className="text-gray-900">{reviewingSubmission.studentName}</strong> • Assignment: <strong className="text-gray-900">{reviewingSubmission.assignmentTitle}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseReview}
                    disabled={isSavingGrade || isReviewScanning}
                    aria-label="Close submission review"
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Close ✕
                  </button>
                </div>

                <div className="mt-5 space-y-5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                          Submitted File
                        </p>
                        <p className="mt-1 text-sm font-extrabold text-gray-900">
                          {reviewingSubmission.essayTitle}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Turned in on {formatDateTime(reviewingSubmission.createdAt)} • Status: <span className="font-bold text-emerald-700 uppercase">{processingLabel(reviewingSubmission.processingState)}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openSubmissionFile(reviewingSubmission.fileUrl, setErrorMessage)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50 shadow-sm transition"
                        >
                          <FileSearchIcon className="h-4 w-4 text-gray-500" />
                          <span>Open submission file</span>
                        </button>
                        {reviewTranscribedText.trim() !== String(reviewingSubmission.transcribedText || "").trim() && (
                          <button
                            type="button"
                            disabled={isReviewScanning || ["submitted", "processing"].includes(reviewingSubmission.processingState)}
                            onClick={handleRunReviewScan}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:bg-emerald-400 shadow-sm transition"
                          >
                            <FileSearchIcon className="h-4 w-4" />
                            <span>{isReviewScanning ? "Rechecking..." : "Recheck corrected text"}</span>
                          </button>
                        )}
                        {reviewingSubmission.processingState === "failed" && !reviewScanResult && (
                          <button
                            type="button"
                            disabled={isReviewScanning}
                            onClick={handleRunReviewScan}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-700 px-3.5 text-xs font-extrabold text-white hover:bg-red-800 disabled:bg-red-400 shadow-sm transition"
                          >
                            <FileSearchIcon className="h-4 w-4" />
                            <span>{isReviewScanning ? "Retrying..." : "Retry processing"}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Submitted image preview */}
                    {isLoadingImagePreview && (
                      <div className="mt-4 h-48 animate-pulse rounded-xl bg-gray-200" />
                    )}
                    {reviewImagePreviewUrl && !isLoadingImagePreview && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                          Submitted image
                        </p>
                        <div
                          className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm"
                          onClick={() => setIsImageExpanded(true)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setIsImageExpanded(true)}
                          title="Click to expand"
                          style={{ maxHeight: "320px" }}
                        >
                          <img
                            src={reviewImagePreviewUrl}
                            alt="Student submission"
                            className="w-full object-contain transition duration-200 group-hover:brightness-90"
                            style={{ maxHeight: "320px" }}
                            onError={(e) => {
                              e.target.closest(".group").style.display = "none";
                            }}
                          />
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l-5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                            Expand
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lightbox overlay */}
                  {isImageExpanded && reviewImagePreviewUrl && (
                    <div
                      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                      onClick={() => setIsImageExpanded(false)}
                    >
                      <div className="relative max-h-[95vh] max-w-[95vw]">
                        <button
                          type="button"
                          onClick={() => setIsImageExpanded(false)}
                          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white font-bold text-gray-800 shadow-lg hover:bg-gray-100 text-sm"
                        >
                          ✕
                        </button>
                        <img
                          src={reviewImagePreviewUrl}
                          alt="Student submission full view"
                          className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <p className="mt-2 text-center text-xs font-semibold text-white/70">
                          {reviewingSubmission.essayTitle} — {reviewingSubmission.studentName}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* DETECTION RESULT (matching Image 1) */}
                  {isReviewScanning ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 animate-spin rounded-full border-3 border-emerald-700 border-t-transparent shrink-0" />
                        <div>
                          <p className="text-sm font-extrabold text-emerald-950">
                            {reviewScanProgressText || "Scanning submission with Copyleaks..."}
                          </p>
                          <p className="text-xs font-semibold text-emerald-700 mt-1">
                            Running YOLO26x + TrOCR handwriting transcription & Copyleaks Authenticity API matching.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : reviewScanResult ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                            DETECTION RESULT
                          </p>
                          <h4 className="mt-1 text-2xl font-black text-gray-950">
                            Plagiarism check
                          </h4>
                        </div>
                        <span className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-black ${reviewResultBadgeClass}`}>
                          {reviewScanResult.label || "Low review"}
                        </span>
                      </div>

                      {/* Score Box & 2x2 Stats Grid FIRST */}
                      <div className="mt-6 grid gap-4 sm:grid-cols-[160px_1fr]">
                        <div className={`grid aspect-square place-items-center rounded-lg bg-white text-center ring-8 ${reviewResultRingClass}`}>
                          <div>
                            <strong className="block text-5xl font-black">
                              {reviewScanResult.score}%
                            </strong>
                            <span className="mt-1 block text-xs font-extrabold uppercase tracking-normal text-gray-500">
                              Plagiarism score
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {reviewScanResult.wordCount ?? 0}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Total words
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {reviewScanResult.identicalWords ?? 0}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Matched / identical words
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-emerald-800">
                              {reviewScanResult.scanStatus || "Completed"}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Scan status
                            </p>
                          </div>

                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="text-2xl font-black text-gray-950">
                              {reviewScanResult.matchedSources?.length ?? 0}
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-500">
                              Matching sources
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Transcribed student handwriting SECOND */}
                      <div className="mt-6">
                        <div className="flex items-center justify-between pb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-gray-900">
                              Transcribed student handwriting
                            </p>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                              YOLO26x + TrOCR
                            </span>
                          </div>
                          {reviewTranscribedText && (
                            <button
                              type="button"
                              onClick={() => handleCopyReviewTranscript(reviewTranscribedText)}
                              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:text-emerald-900 transition"
                            >
                              {reviewCopySuccess ? (
                                <>
                                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon className="h-3.5 w-3.5" />
                                  <span>Copy text</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <HighlightedText text={reviewTranscribedText} scanResult={reviewScanResult} />
                      </div>

                      {/* Classroom Peer-to-Peer Similarity Section */}
                      {reviewScanResult.peerSimilarity && (
                        <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/70 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-black shadow-sm">
                                👥
                              </span>
                              <div>
                                <h4 className="text-sm font-black text-indigo-950">
                                  Classroom Peer Similarity
                                </h4>
                                <p className="text-xs font-semibold text-indigo-700">
                                  {reviewScanResult.peerSimilarity.total_peers_compared === 0
                                    ? "No other classmate submissions for this assignment yet"
                                    : reviewScanResult.peerSimilarity.total_peers_compared === 1
                                      ? "Cross-checked against 1 classmate submission"
                                      : `Cross-checked against ${reviewScanResult.peerSimilarity.total_peers_compared} classmate submissions`}
                                </p>
                              </div>
                            </div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
                              reviewScanResult.peerSimilarity.total_peers_compared === 0
                                ? "bg-gray-100 text-gray-700 border border-gray-200"
                                : reviewScanResult.peerSimilarity.has_peer_match
                                  ? "bg-red-100 text-red-800 border border-red-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}>
                              {reviewScanResult.peerSimilarity.total_peers_compared === 0 ? (
                                "Only Submission (No Peers)"
                              ) : (
                                <>
                                  {reviewScanResult.peerSimilarity.peer_similarity_score}% Match
                                  {reviewScanResult.peerSimilarity.has_peer_match ? " (High Peer Copy)" : " (Original Work)"}
                                </>
                              )}
                            </span>
                          </div>

                          {reviewScanResult.peerSimilarity.matching_snippets?.length > 0 && (
                            <div className="mt-3.5 space-y-1.5 border-t border-indigo-200/80 pt-3 text-xs">
                              <p className="font-extrabold text-indigo-900">Matching consecutive phrases:</p>
                              {reviewScanResult.peerSimilarity.matching_snippets.map((snip, sIdx) => (
                                <blockquote key={sIdx} className="rounded border-l-2 border-indigo-500 bg-white px-3 py-1.5 text-gray-800 font-medium italic shadow-2xs">
                                  "{snip}"
                                </blockquote>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Matching Sources */}
                      {reviewScanResult.matchedSources && reviewScanResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).length > 0 && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-extrabold text-gray-800">
                              Matching sources ({reviewScanResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).length})
                            </p>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                              Copyleaks Database
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {reviewScanResult.matchedSources.filter(s => !s.url?.includes("wikipedia.org")).map((source, sIdx) => (
                              <div
                                key={source.id || sIdx}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-extrabold text-gray-900 truncate">
                                      {source.title || "Matched source"}
                                    </p>
                                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      {source.source_type || "Copyleaks Database"}
                                    </span>
                                  </div>
                                  {source.url && (
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-emerald-700 hover:underline truncate block mt-0.5"
                                    >
                                      {source.url}
                                    </a>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  <span className="rounded bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                                    {source.matched_words || source.identical_words || 0} matched words
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Copyleaks API Footer Notice */}
                      <p className="mt-6 text-sm font-semibold leading-6 text-gray-600">
                        {reviewScanResult.summary || "Scanned via Copyleaks Authenticity API. Comprehensive database and source matching completed."}
                      </p>

                      {/* Review Signals */}
                      {reviewScanResult.flags && reviewScanResult.flags.length > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-extrabold text-gray-800">
                            Review signals
                          </p>
                          <div className="mt-3 space-y-2">
                            {reviewScanResult.flags.map((flag, fIdx) => (
                              <p
                                key={fIdx}
                                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600"
                              >
                                {flag}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : ["submitted", "processing"].includes(reviewingSubmission.processingState) ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-6 text-center">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
                      </div>
                      <h4 className="mt-3 text-base font-black text-amber-950">
                        Automated Submission Processing in Progress
                      </h4>
                      <p className="mt-1 text-xs font-semibold text-amber-800 max-w-lg mx-auto">
                        The uploaded handwritten work is automatically being processed through YOLO line detection, TrOCR transcription, and Plagiarism Detection. Results will display here automatically.
                      </p>
                    </div>
                  ) : reviewingSubmission.processingState === "failed" ? (
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-center">
                      <p className="text-xs font-black uppercase tracking-wider text-red-700">
                        PROCESSING STATUS
                      </p>
                      <h4 className="mt-1 text-base font-black text-red-950">
                        Automated Processing Incomplete
                      </h4>
                      <p className="mt-1 text-xs font-semibold text-red-700 max-w-lg mx-auto">
                        {reviewingSubmission.processingError || "Automated check encountered an issue during background processing."}
                      </p>
                      <button
                        type="button"
                        onClick={handleRunReviewScan}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-red-800 shadow-sm"
                      >
                        <FileSearchIcon className="h-4 w-4" />
                        <span>Retry Processing</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-6 text-center">
                      <h4 className="text-sm font-black text-gray-900">
                        Awaiting Automated Scan Result
                      </h4>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        Plagiarism checking runs automatically upon student submission. Synchronizing server status...
                      </p>
                    </div>
                  )}

                  <StatusMessage error={errorMessage || submissionSyncError} message={successMessage} />
                  <p className="mt-3 text-sm font-bold">{processingLabel(reviewingSubmission.processingState)}</p>
                  {reviewingSubmission.processingError && <p role="alert" className="mt-2 text-sm text-red-700">{reviewingSubmission.processingError}</p>}
                  <label className="mt-4 block text-sm font-bold" htmlFor="review-transcription">Correct transcription before rechecking</label>
                  <textarea id="review-transcription" rows={8} value={reviewTranscribedText}
                    disabled={["submitted", "processing"].includes(reviewingSubmission.processingState)}
                    onChange={(event) => setReviewTranscribedText(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm" />
                  {reviewTranscribedText.trim() !== String(reviewingSubmission.transcribedText || "").trim() && (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2">
                      <p className="text-xs font-semibold text-amber-800">
                        Transcription has been edited. Recheck to update similarity metrics.
                      </p>
                      <button
                        type="button"
                        disabled={isReviewScanning}
                        onClick={handleRunReviewScan}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:bg-emerald-400 shadow-sm transition"
                      >
                        <FileSearchIcon className="h-3.5 w-3.5" />
                        <span>{isReviewScanning ? "Rechecking..." : "Recheck with corrected text"}</span>
                      </button>
                    </div>
                  )}
                  {/* Grading Form */}
                  <form onSubmit={handleSaveGrade} className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
                    <h4 className="text-base font-black text-emerald-950">
                      Grade Submission
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">
                      Assign a score and leave feedback for {reviewingSubmission.studentName}. Results stay private until returned. Editing saved results makes them private again.
                    </p>

                    <div className="mt-4">
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700">
                        Grade / Score
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="e.g. 95 or A+"
                          value={gradeInput}
                          onChange={(e) => setGradeInput(e.target.value)}
                          className="h-11 w-44 rounded-lg border border-gray-300 bg-white px-3.5 text-base font-black text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {[100, 95, 90, 85, 80, 75].map((score) => (
                            <button
                              key={score}
                              type="button"
                              onClick={() => setGradeInput(String(score))}
                              className={`h-9 rounded-lg border px-3 text-xs font-bold transition ${
                                gradeInput === String(score)
                                  ? "border-emerald-600 bg-emerald-700 text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700">
                        Teacher Feedback (optional)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Leave remarks or suggestions for the student..."
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    <p className="mt-3 text-sm font-medium text-emerald-800">
                      {reviewingSubmission.returnedAt ? "Returned to student" : "Grade hidden until you return work"}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-3">
                      <button type="button" onClick={handleReturnWork}
                        disabled={isSavingGrade || isReviewScanning || ["submitted", "processing", "failed"].includes(reviewingSubmission.processingState) || !String(gradeInput ?? "").trim()}
                        className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">
                        Return work
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseReview}
                        disabled={isSavingGrade || isReviewScanning}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-xs font-extrabold text-gray-700 transition hover:bg-gray-50"
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingGrade}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-800 disabled:bg-emerald-400 shadow-sm"
                      >
                        {isSavingGrade ? "Saving grade..." : "Save Grade"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
          {/* Lightbox for Upload station manual check image */}
          {isManualImageExpanded && manualCheckImageUrl && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={() => setIsManualImageExpanded(false)}
            >
              <div className="relative max-h-[95vh] max-w-[95vw]">
                <button
                  type="button"
                  onClick={() => setIsManualImageExpanded(false)}
                  className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-gray-800 shadow-xl hover:bg-gray-100 text-sm transition"
                  title="Close full view"
                >
                  ✕
                </button>
                <img
                  src={manualCheckImageUrl}
                  alt="Original essay full view"
                  className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
                <p className="mt-2 text-center text-xs font-semibold text-white/80">
                  {manualCheckTitle || manualCheckFiles[0]?.name || "Original Scanned Essay"}
                </p>
              </div>
            </div>
          )}
        {/* Archive / Restore Confirmation Modal Dialog */}
        {archivingClassroom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    archivingClassroom.archive
                      ? "bg-amber-100 text-amber-800"
                      : "bg-[#e6f4ea] text-[#137333]"
                  }`}
                >
                  {archivingClassroom.archive ? (
                    <ArchiveIcon className="h-6 w-6" />
                  ) : (
                    <UnarchiveIcon className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#202124]">
                    {archivingClassroom.archive ? "Archive class?" : "Restore class?"}
                  </h3>
                  <p className="text-xs text-[#5f6368] font-medium">
                    {archivingClassroom.name}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-[#5f6368] leading-relaxed">
                {archivingClassroom.archive
                  ? `Archiving "${archivingClassroom.name}" moves it to your Archived classes tab. The class becomes read-only: all past assignments, submissions, and grades remain safely preserved, but no new assignments or submissions can be posted. You can restore this class at any time.`
                  : `Restoring "${archivingClassroom.name}" moves it back to your Active classes list. You and enrolled students will be able to post assignments and submit work again.`}
              </p>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#dadce0]">
                <button
                  type="button"
                  disabled={isArchiving}
                  onClick={() => setArchivingClassroom(null)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isArchiving}
                  onClick={() =>
                    handleArchiveClassroom(
                      archivingClassroom.id,
                      archivingClassroom.archive
                    )
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium text-white shadow-xs transition disabled:opacity-50 ${
                    archivingClassroom.archive
                      ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
                      : "bg-[#137333] hover:bg-[#0f5b28] active:bg-[#0c471f]"
                  }`}
                >
                  {isArchiving ? (
                    <span>Processing...</span>
                  ) : archivingClassroom.archive ? (
                    <>
                      <ArchiveIcon className="h-4 w-4" />
                      <span>Archive</span>
                    </>
                  ) : (
                    <>
                      <UnarchiveIcon className="h-4 w-4" />
                      <span>Restore</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Copy Class Modal (Google Classroom Clone Feature) */}
        {copyingClassroom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#dadce0]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                    <CopyIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#202124]">Copy class</h3>
                    <p className="text-xs text-[#5f6368]">Duplicate syllabus and coursework</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCopyingClassroom(null)}
                  disabled={isCopying}
                  className="rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmCopyClassroom} className="mt-4 space-y-4">
                <div className="rounded-xl bg-[#f8f9fa] border border-[#dadce0] p-3 text-xs text-[#5f6368] space-y-1">
                  <p className="font-semibold text-[#202124]">What gets copied:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#444746]">
                    <li>All assignment titles, instructions, and settings</li>
                    <li>A brand new classroom join code</li>
                  </ul>
                  <p className="font-semibold text-[#202124] pt-1">What does NOT get copied:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#444746]">
                    <li>Previous students and class rosters</li>
                    <li>Past essay submissions and grades</li>
                  </ul>
                </div>

                <div>
                  <label htmlFor="copy-class-name" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1">
                    Class name (required)
                  </label>
                  <input
                    id="copy-class-name"
                    required
                    value={copyForm.name}
                    onChange={(e) => setCopyForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Copy of History 101"
                    className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-sm text-[#202124] outline-none transition focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="copy-section" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1">
                      Section (required)
                    </label>
                    <input
                      id="copy-section"
                      required
                      value={copyForm.section}
                      onChange={(e) => setCopyForm((prev) => ({ ...prev, section: e.target.value }))}
                      placeholder="e.g. 2A, Fall 2026"
                      className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-sm text-[#202124] outline-none transition focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    />
                  </div>
                  <div>
                    <label htmlFor="copy-subject" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1">
                      Subject
                    </label>
                    <input
                      id="copy-subject"
                      value={copyForm.subject}
                      onChange={(e) => setCopyForm((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g. History"
                      className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-sm text-[#202124] outline-none transition focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dadce0]">
                  <button
                    type="button"
                    disabled={isCopying}
                    onClick={() => setCopyingClassroom(null)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCopying}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-[#0f5b28] disabled:opacity-50"
                  >
                    {isCopying ? "Copying class..." : "Copy class"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </section>
      </main>
    </div>
  );
}
