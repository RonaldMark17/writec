import { processingLabel, useSubmissionProgress } from "./dashboard/submissionProgress";
import { apiFetch, getBackendUrl } from "../apiFetch";
import ClassroomDetail from "./dashboard/ClassroomDetail";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../supabaseClient";
import {
  ASSIGNMENT_TABLE,
  CLASSROOM_TABLE,
  CheckIcon,
  ClipboardIcon,
  CopyIcon,
  DoorIcon,
  CalendarIcon,
  ESSAY_BUCKET,
  FileIcon,
  FileSearchIcon,
  MEMBER_TABLE,
  Header,
  ImageIcon,
  ArchiveIcon,
  PlusIcon,
  StatusMessage,
  UploadIcon,
  AlertCircleIcon,
  ClockIcon,
  filterAndSortTodoAssignments,
  formatDateTime,
  normalizeAssignment,
  normalizeClassroom,
  openSubmissionFile,
  resolveStorageImageUrl,
  studentPages,
  SearchIcon,
  getInitials,
  getTeacherAvatarTheme,
  isCustomAvatarUrl,
  getAvatarPublicUrl,
  LeaveIcon,
} from "./dashboard/shared";
import {
  ACCEPTED_CHECK_FILE_TYPES,
  formatFileSize,
  getFileKind,
} from "./dashboard/plagiarismScan";
import HighlightedText from "./HighlightedText";

const submissionModes = [
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

const emptySubmissionDraft = {
  assignmentId: "",
  essayTitle: "",
  mode: "",
  text: "",
};

function sanitizeFileName(value) {
  const cleanValue =
    value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

  return cleanValue || "essay-submission";
}

function getSubmissionBlockMessage(draft, file) {
  if (!draft.mode) {
    return "Choose Picture, File, or Paste first.";
  }

  if (draft.mode === "text" && !draft.text.trim()) {
    return "Paste your essay text before submitting.";
  }

  if ((draft.mode === "picture" || draft.mode === "file") && !file) {
    return draft.mode === "picture"
      ? "Choose an image before submitting."
      : "Choose a file before submitting.";
  }

  return "";
}

export default function StudentDashboard({ profile, onProfileUpdated }) {
  const [openedClassroomId, setOpenedClassroomId] = useState(null);

  const [activePage, setActivePage] =
    useState("classrooms");

  const [classrooms, setClassrooms] =
    useState([]);

  const [classroomTab, setClassroomTabState] = useState(() => {
    if (typeof window !== "undefined") {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab === "active" || urlTab === "archived") return urlTab;
      try {
        const saved = sessionStorage.getItem(`writecheck-student-classroom-tab-${profile?.id || "student"}`);
        if (saved === "active" || saved === "archived") return saved;
      } catch {}
    }
    return "active";
  });

  const setClassroomTab = useCallback((tab) => {
    setClassroomTabState(tab);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`writecheck-student-classroom-tab-${profile?.id || "student"}`, tab);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      } catch {}
    }
  }, [profile?.id]);

  const activeClassrooms = useMemo(
    () => classrooms.filter((classroom) => !classroom.isArchived),
    [classrooms]
  );

  const archivedClassrooms = useMemo(
    () => classrooms.filter((classroom) => Boolean(classroom.isArchived)),
    [classrooms]
  );

  const visibleClassrooms =
    classroomTab === "active" ? activeClassrooms : archivedClassrooms;

  const [assignments, setAssignments] =
    useState([]);

  const [submissions, setSubmissions] =
    useState([]);

  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionClassroomId, setSubmissionClassroomId] = useState("all");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState("all");
  const [submissionSort, setSubmissionSort] = useState("newest");

  const [joinCode, setJoinCode] =
    useState("");

  const [selectedClassroomId, setSelectedClassroomId] =
    useState("");

  const [submissionDraft, setSubmissionDraft] =
    useState(emptySubmissionDraft);

  const [submissionFile, setSubmissionFile] =
    useState(null);

  const [filePreview, setFilePreview] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isJoiningClassroom, setIsJoiningClassroom] =
    useState(false);

  const [isJoinModalOpen, setIsJoinModalOpen] =
    useState(false);

  const [isSubmittingEssay, setIsSubmittingEssay] =
    useState(false);

  const [leavingClassroom, setLeavingClassroom] =
    useState(null);

  const [isLeaving, setIsLeaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    if (!successMessage && !errorMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage("");
      setErrorMessage("");
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage, errorMessage]);

  useEffect(() => {
    setSuccessMessage("");
    setErrorMessage("");
  }, [activePage]);

  const [viewingSubmission, setViewingSubmission] =
    useState(null);

  const [studentImagePreviewUrl, setStudentImagePreviewUrl] =
    useState("");

  const [isStudentImageExpanded, setIsStudentImageExpanded] =
    useState(false);

  const [studentCopySuccess, setStudentCopySuccess] =
    useState(false);

  const selectedAssignment =
    assignments.find((assignment) => assignment.id === submissionDraft.assignmentId) ??
    null;

  const selectedClassroom =
    classrooms.find((classroom) => classroom.id === selectedClassroomId) ??
    null;

  const assignmentGroups = filterAndSortTodoAssignments(
    assignments,
    selectedClassroomId
  );

  const todoAssignments = assignmentGroups.todoList;
  const dueSoonAssignments = assignmentGroups.dueSoonList.filter(
    (assignment) => assignment.dueInfo.isDueSoon
  );

  const resetSubmissionDraft = useCallback(() => {
    setSubmissionDraft(emptySubmissionDraft);
    setSubmissionFile(null);
    setFilePreview("");
  }, []);

  const submissionSyncError = useSubmissionProgress(profile?.id, setSubmissions, false);

  const loadStudentData = useCallback(async () => {
    const studentId = profile?.id;
    if (!studentId) return;

    setIsLoading(true);
    setErrorMessage("");

    const { data: membershipRows, error: membershipError } =
      await supabase
        .from(MEMBER_TABLE)
        .select("id, classroom_id, student_id")
        .eq("student_id", studentId);

    if (membershipError) {
      setErrorMessage(membershipError.message);
      setIsLoading(false);
      return;
    }

    const classroomIds =
      [...new Set((membershipRows ?? []).map((membership) => membership.classroom_id))];

    if (classroomIds.length === 0) {
      setClassrooms([]);
      setAssignments([]);
      setSubmissions([]);
      setSelectedClassroomId("");
      resetSubmissionDraft();
      setIsLoading(false);
      return;
    }

    let { data: classroomRows, error: classroomError } =
      await supabase
        .from(CLASSROOM_TABLE)
        .select("id, created_at, teacher_id, classroom_name, classroom_code, subject, section, teacher_name, is_archived")
        .in("id", classroomIds)
        .order("created_at", { ascending: false });

    if (classroomError && (classroomError.message?.includes("is_archived") || classroomError.message?.includes("teacher_name") || classroomError.code === "42703" || classroomError.code === "PGRST204")) {
      const fallback = await supabase
        .from(CLASSROOM_TABLE)
        .select("id, created_at, teacher_id, classroom_name, classroom_code, subject, section")
        .in("id", classroomIds)
        .order("created_at", { ascending: false });
      classroomRows = fallback.data;
      classroomError = fallback.error;
    }

    if (classroomError) {
      setErrorMessage(classroomError.message);
      setIsLoading(false);
      return;
    }

    let { data: assignmentRows, error: assignmentError } =
      await supabase
        .from(ASSIGNMENT_TABLE)
        .select("id, created_at, classroom_id, teacher_id, title, instructions, due_date, accept_late_submissions")
        .in("classroom_id", classroomIds)
        .order("created_at", { ascending: false });

    if (assignmentError && (assignmentError.message?.includes("accept_late_submissions") || assignmentError.code === "42703" || assignmentError.code === "PGRST204")) {
      const fallback = await supabase
        .from(ASSIGNMENT_TABLE)
        .select("id, created_at, classroom_id, teacher_id, title, instructions, due_date")
        .in("classroom_id", classroomIds)
        .order("created_at", { ascending: false });
      assignmentRows = fallback.data;
      assignmentError = fallback.error;
    }

    if (assignmentError) {
      setErrorMessage(assignmentError.message);
      setIsLoading(false);
      return;
    }

    const assignmentIds =
      (assignmentRows ?? []).map((assignment) => assignment.id);

    let submissionRows = [];

    if (assignmentIds.length > 0) {
      const { data: submissionsData, error: submissionError } =
        await supabase.rpc("list_submission_results");

      if (submissionError) {
        setErrorMessage(submissionError.message);
        setIsLoading(false);
        return;
      }

      submissionRows =
        submissionsData ?? [];
    }

    const teacherIds =
      [...new Set((classroomRows ?? []).map((classroom) => classroom.teacher_id).filter(Boolean))];

    let teacherRows = [];

    if (teacherIds.length > 0) {
      try {
        const { data: teachers } =
          await supabase
            .from("userTable")
            .select("id, full_name, email")
            .in("id", teacherIds);

        teacherRows = teachers ?? [];
      } catch {}
    }

    const teachersById =
      new Map(
        teacherRows.map((teacher) => [
          teacher.id,
          { id: teacher.id, name: teacher.full_name || teacher.email || "Teacher", email: teacher.email || "" },
        ])
      );

    for (const c of (classroomRows ?? [])) {
      if (!c.teacher_id) continue;
      const existing = teachersById.get(c.teacher_id);
      let cached = null;
      if (!existing || existing.name === "Teacher" || !existing.email) {
        try {
          const s = localStorage.getItem(`writecheck_teacher_${c.teacher_id}`) || localStorage.getItem(`writecheck_profile_prefs_${c.teacher_id}`);
          if (s) cached = JSON.parse(s);
        } catch {}
      }
      const finalName = (existing?.name && existing.name !== "Teacher")
        ? existing.name
        : c.teacher_name || cached?.name || cached?.full_name || existing?.name || "Teacher";
      const finalEmail = existing?.email || cached?.email || "";
      const avatarColor = cached?.avatarColor || "";
      const avatarUrl =
        (cached?.avatarUrl && isCustomAvatarUrl(cached.avatarUrl))
          ? cached.avatarUrl
          : getAvatarPublicUrl(c.teacher_id);

      teachersById.set(c.teacher_id, {
        id: c.teacher_id,
        name: finalName,
        email: finalEmail,
        avatarColor,
        avatarUrl,
      });
    }

    const assignmentCountByClass =
      (assignmentRows ?? []).reduce((counts, assignment) => {
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

    const cachedArchivedSet = new Set();
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

    [
      `writecheck_archived_classes_${studentId}`,
      "writecheck_archived_classes_teacher",
      "writecheck_archived_classes_global",
    ].forEach((key) => {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(stored)) {
          stored.forEach((id) => cachedArchivedSet.add(String(id)));
        }
      } catch {}
    });

    // Query backend for archived classrooms (authoritative service-role check from DB)
    let backendArchivedIds = null;
    try {
      const backendUrl = getBackendUrl();
      const archResp = await apiFetch(`${backendUrl}/api/classrooms/archived`);
      if (archResp && archResp.ok) {
        const archData = await archResp.json();
        if (Array.isArray(archData?.archived_ids)) {
          backendArchivedIds = new Set(archData.archived_ids.map(String));
        }
      }
    } catch (err) {
      console.warn("Could not fetch archived IDs from backend service:", err);
    }

    const nextClassrooms =
      (classroomRows ?? []).map((classroom, index) => {
        const teacherInfo = teachersById.get(classroom.teacher_id) || {
          id: classroom.teacher_id,
          name: classroom.teacher_name || "Teacher",
          email: "",
        };
        const classIdStr = String(classroom.id);
        let isArchived = false;

        // Authoritative resolution:
        if (backendArchivedIds !== null) {
          isArchived = backendArchivedIds.has(classIdStr);
        } else if (typeof classroom.is_archived === "boolean") {
          isArchived = classroom.is_archived;
        } else {
          isArchived = cachedArchivedSet.has(classIdStr);
        }

        if (isArchived) {
          cachedArchivedSet.add(classIdStr);
        } else {
          cachedArchivedSet.delete(classIdStr);
        }

        const resolvedTeacherName = teacherInfo.name || classroom.teacher_name || "Teacher";
        const teacherAvatarUrl = teacherInfo.avatarUrl || getAvatarPublicUrl(classroom.teacher_id);
        return normalizeClassroom(classroom, index, {
          assignments: assignmentCountByClass[classroom.id] ?? 0,
          submissions: submissionCountByClass[classroom.id] ?? 0,
          teacher: resolvedTeacherName,
          teacherInfo: {
            ...teacherInfo,
            avatarUrl: teacherAvatarUrl,
          },
          teacherAvatarUrl,
          isArchived,
        });
      });

    if (studentId) {
      try {
        localStorage.setItem(
          `writecheck_archived_classes_${studentId}`,
          JSON.stringify(Array.from(cachedArchivedSet))
        );
      } catch {}
    }

    const classroomsById =
      new Map(nextClassrooms.map((classroom) => [classroom.id, classroom]));

    const submissionsByAssignment =
      new Map(submissionRows.map((submission) => [submission.assignment_id, submission]));

    const nextAssignments =
      (assignmentRows ?? []).map((assignment) =>
        normalizeAssignment(assignment, classroomsById, {
          submitted: submissionsByAssignment.has(assignment.id),
          submission: submissionsByAssignment.get(assignment.id) ?? null,
        })
      );

    const assignmentsById =
      new Map(nextAssignments.map((assignment) => [assignment.id, assignment]));

    const nextSubmissions =
      submissionRows.map((submission) => {
        const assignment =
          assignmentsById.get(submission.assignment_id);

        return {
          id: submission.id,
          createdAt: submission.created_at,
          assignmentId: submission.assignment_id,
          assignmentTitle: assignment?.title || "Assignment",
          classroomId: assignment?.classroomId || "",
          classroomName: assignment?.classroomName || "Classroom",
          classroomSection: assignment?.classroomSection || "",
          classroomSubject: assignment?.classroomSubject || "",
          dueDate: assignment?.dueDate || null,
          essayTitle: submission.essay_title || "Essay submission",
          fileUrl: submission.file_url,
          returnedAt: submission.returned_at,
          status: submission.status || "submitted",
          grade: submission.returned_at ? (submission.grade ?? "") : "",
          feedback: submission.returned_at ? (submission.feedback ?? "") : "",
          transcribedText: submission.transcribed_text ?? "",
          scanResult: null, // Plagiarism detection results are never exposed to the student
          processingState: submission.processing_state || (submission.transcribed_text ? "ready" : "submitted"),
          processingError: null,
          hasUploaded: true,
          hasTranscribed: Boolean(submission.transcribed_text || submission.processing_state === "ready"),
          hasRecorded: Boolean(submission.transcribed_text || submission.processing_state === "ready"),
          hasPlagiarismChecked: Boolean(submission.scan_result || submission.processing_state === "ready"),
        };
      });

    setClassrooms(nextClassrooms);
    setAssignments(nextAssignments);
    setSubmissions(nextSubmissions);
    setSelectedClassroomId((currentId) =>
      currentId && nextClassrooms.some((classroom) => classroom.id === currentId)
        ? currentId
        : ""
    );
    setSubmissionDraft((currentDraft) => ({
      ...currentDraft,
      assignmentId:
        nextAssignments.some(
          (assignment) =>
            assignment.id === currentDraft.assignmentId && !assignment.submitted
        )
          ? currentDraft.assignmentId
          : "",
    }));
    setIsLoading(false);
  }, [profile?.id, resetSubmissionDraft]);

  useEffect(() => {
    if (profile?.id) {
      loadStudentData();
    }
  }, [profile?.id, loadStudentData]);

  useEffect(() => {
    function handleClassroomArchived(event) {
      const { classroomId, isArchived } = event?.detail || {};
      if (!classroomId) return;
      setClassrooms((prev) =>
        prev.map((c) =>
          String(c.id) === String(classroomId) ? { ...c, isArchived: Boolean(isArchived) } : c
        )
      );
    }
    window.addEventListener("writecheck:classroom_archived", handleClassroomArchived);
    return () => {
      window.removeEventListener("writecheck:classroom_archived", handleClassroomArchived);
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not refetch on TOKEN_REFRESHED (which fires on tab switch / window focus)
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (session?.user?.id) {
          loadStudentData();
        }
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadStudentData]);

  useEffect(() => {
    if (!submissionFile || !submissionFile.type?.startsWith("image/")) {
      setFilePreview("");
      return undefined;
    }

    const previewUrl =
      URL.createObjectURL(submissionFile);

    setFilePreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [submissionFile]);

  useEffect(() => {
    setViewingSubmission((current) => current ? submissions.find((row) => row.id === current.id) || current : null);
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    let list = submissions;

    if (submissionClassroomId !== "all" && submissionClassroomId) {
      list = list.filter((sub) => String(sub.classroomId) === String(submissionClassroomId));
    }

    if (submissionStatusFilter === "graded") {
      list = list.filter((sub) => sub.returnedAt && String(sub.grade ?? "").trim() !== "");
    } else if (submissionStatusFilter === "returned") {
      list = list.filter((sub) => Boolean(sub.returnedAt));
    } else if (submissionStatusFilter === "awaiting") {
      list = list.filter((sub) => !sub.returnedAt);
    }

    const term = submissionSearch.trim().toLowerCase();
    if (term) {
      list = list.filter((sub) => {
        const haystack = [
          sub.assignmentTitle,
          sub.essayTitle,
          sub.classroomName,
          sub.classroomSubject,
          sub.classroomSection,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    return [...list].sort((a, b) => {
      if (submissionSort === "oldest") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (submissionSort === "grade") {
        const aGrade = parseFloat(a.grade) || 0;
        const bGrade = parseFloat(b.grade) || 0;
        return bGrade - aGrade;
      }
      if (submissionSort === "assignment") {
        return (a.assignmentTitle || "").localeCompare(b.assignmentTitle || "");
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [submissions, submissionClassroomId, submissionStatusFilter, submissionSearch, submissionSort]);

  const submissionStats = useMemo(() => {
    const total = submissions.length;
    const graded = submissions.filter((s) => s.returnedAt && String(s.grade ?? "").trim() !== "").length;
    const returned = submissions.filter((s) => Boolean(s.returnedAt)).length;
    const awaiting = total - returned;

    return { total, graded, returned, awaiting };
  }, [submissions]);

  const handleJoinClassroom = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const cleanCode =
      joinCode.trim().toUpperCase();

    if (!cleanCode) {
      return;
    }

    const alreadyJoined =
      classrooms.some((classroom) => classroom.code === cleanCode);

    if (alreadyJoined) {
      setSuccessMessage("You are already in that classroom.");
      setJoinCode("");
      return;
    }

    setIsJoiningClassroom(true);

    const { data: classroom, error: classroomError } =
      await supabase
        .from(CLASSROOM_TABLE)
        .select("id, classroom_name, classroom_code")
        .eq("classroom_code", cleanCode)
        .maybeSingle();

    if (classroomError) {
      setErrorMessage(classroomError.message);
      setIsJoiningClassroom(false);
      return;
    }

    if (!classroom) {
      setErrorMessage("No classroom found with that code.");
      setIsJoiningClassroom(false);
      return;
    }

    const { data: existingMembership, error: existingMembershipError } =
      await supabase
        .from(MEMBER_TABLE)
        .select("id")
        .eq("classroom_id", classroom.id)
        .eq("student_id", profile.id)
        .maybeSingle();

    if (existingMembershipError) {
      setErrorMessage(existingMembershipError.message);
      setIsJoiningClassroom(false);
      return;
    }

    if (existingMembership) {
      setSuccessMessage("You are already in that classroom.");
      setJoinCode("");
      setIsJoiningClassroom(false);
      await loadStudentData();
      return;
    }

    const { error: membershipError } =
      await supabase
        .from(MEMBER_TABLE)
        .insert({
          classroom_id: classroom.id,
          student_id: profile.id,
        });

    if (membershipError?.code === "23505") {
      setSuccessMessage("You are already in that classroom.");
      setJoinCode("");
      setIsJoiningClassroom(false);
      await loadStudentData();
      return;
    }

    if (membershipError) {
      setErrorMessage(membershipError.message);
      setIsJoiningClassroom(false);
      return;
    }

    setJoinCode("");
    setIsJoinModalOpen(false);
    setSuccessMessage(`Joined ${classroom.classroom_name}.`);
    setIsJoiningClassroom(false);
    await loadStudentData();
  };

  const handleConfirmLeaveClassroom = async () => {
    if (!leavingClassroom?.id || !profile?.id) return;
    setIsLeaving(true);
    setErrorMessage("");

    const targetClassroomId = leavingClassroom.id;
    const targetName = leavingClassroom.name || "Classroom";

    try {
      let left = false;
      let failureReason = "";

      // 1. Try backend endpoint
      try {
        const backendUrl = getBackendUrl();
        const response = await apiFetch(`${backendUrl}/api/classrooms/${targetClassroomId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const resBody = await response.json().catch(() => ({}));
        if (response.ok && resBody?.success) {
          left = true;
        } else {
          failureReason = resBody?.detail || resBody?.message || resBody?.error;
        }
      } catch (backendErr) {
        failureReason = backendErr.message || "Failed to reach server";
      }

      // 2. Fallback: Direct Supabase RPC
      if (!left) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc("leave_classroom", {
            target_classroom_id: targetClassroomId,
          });
          if (!rpcErr && rpcRes === true) {
            left = true;
          }
        } catch (rpcEx) {}
      }

      // 3. Fallback: Direct table DELETE
      if (!left) {
        try {
          const { error: delErr } = await supabase
            .from(MEMBER_TABLE)
            .delete()
            .eq("classroom_id", targetClassroomId)
            .eq("student_id", profile.id);
          if (!delErr) {
            left = true;
          }
        } catch (delEx) {}
      }

      if (!left) {
        throw new Error(failureReason || "Could not leave classroom. Please try again.");
      }

      // Optimistically update local state
      setClassrooms((prev) => prev.filter((c) => String(c.id) !== String(targetClassroomId)));
      setAssignments((prev) => prev.filter((a) => String(a.classroomId) !== String(targetClassroomId)));
      if (String(openedClassroomId) === String(targetClassroomId)) {
        setOpenedClassroomId(null);
      }
      setLeavingClassroom(null);
      setSuccessMessage(`You have left "${targetName}".`);

      await loadStudentData();
    } catch (err) {
      setErrorMessage(err.message || "Failed to leave classroom.");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleViewClassroomAssignments = (classroomId) => {
    setSelectedClassroomId(classroomId);
    resetSubmissionDraft();
    setActivePage("assignments");
  };

  const handleOpenSubmissionDraft = (assignment) => {
    setErrorMessage("");
    setSuccessMessage("");
    setSubmissionFile(null);
    setSubmissionDraft({
      ...emptySubmissionDraft,
      assignmentId: assignment.id,
      essayTitle: assignment.title,
    });
  };

  const handleSubmissionModeChange = (mode) => {
    setErrorMessage("");
    setSuccessMessage("");
    setSubmissionFile(null);
    setSubmissionDraft((currentDraft) => ({
      ...currentDraft,
      mode,
      text: mode === "text" ? currentDraft.text : "",
    }));
  };

  const handleSubmitAssignment = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!selectedAssignment) {
      return;
    }

    if (selectedAssignment.submitted) {
      setErrorMessage("You already submitted this assignment.");
      return;
    }

    const assignmentClassroom = classrooms.find((c) => c.id === selectedAssignment.classroomId);
    if (assignmentClassroom?.isArchived) {
      setErrorMessage("This classroom is archived. Submissions are closed.");
      return;
    }

    if (selectedAssignment.dueInfo?.isOverdue && selectedAssignment.acceptLateSubmissions === false) {
      setErrorMessage("Submissions are closed. Your teacher has disabled late submissions for this assignment.");
      return;
    }

    if (!submissionDraft.mode) {
      setErrorMessage("Choose a submission type first.");
      return;
    }

    let uploadFile =
      submissionFile;

    const essayTitle =
      submissionDraft.essayTitle.trim() || selectedAssignment.title;

    if (submissionDraft.mode === "text") {
      const cleanText =
        submissionDraft.text.trim();

      if (!cleanText) {
        setErrorMessage("Paste your essay text before submitting.");
        return;
      }

      uploadFile =
        new File([cleanText], `${sanitizeFileName(essayTitle)}.txt`, {
          type: "text/plain",
        });
    }

    if (!uploadFile) {
      setErrorMessage("Choose a file before submitting.");
      return;
    }

    if (submissionDraft.mode === "picture" && !uploadFile.type?.startsWith("image/")) {
      setErrorMessage("Choose an image file for picture submissions.");
      return;
    }

    setIsSubmittingEssay(true);

    const safeFileName =
      sanitizeFileName(uploadFile.name);

    const filePath =
      `${profile.id}/${selectedAssignment.id}/${Date.now()}-${safeFileName}`;

    let uploadedFileUrl = filePath;

    try {
      const { error: uploadError } =
        await supabase
          .storage
          .from(ESSAY_BUCKET)
          .upload(filePath, uploadFile, {
            contentType: uploadFile.type || "application/octet-stream",
          });

      if (uploadError) {
        console.warn("Supabase storage upload failed, falling back to local backend:", uploadError);
        try {
          const formData = new FormData();
          formData.append("file", uploadFile);
          formData.append("assignment_id", selectedAssignment.id);

          const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
          const res = await apiFetch(`${backendUrl}/api/submissions/upload`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`Fallback upload failed with status ${res.status}`);
          }

          const resData = await res.json();
          uploadedFileUrl = resData.file_url;
        } catch (fallbackError) {
          console.error("Local fallback upload also failed:", fallbackError);
          const isBucketMissing =
            uploadError.message?.toLowerCase().includes("bucket not found") ||
            uploadError.statusCode === "404" ||
            uploadError.status === 400;

          setErrorMessage(
            isBucketMissing
              ? `Supabase Storage bucket "${ESSAY_BUCKET}" was not found. Please create the "${ESSAY_BUCKET}" bucket in your Supabase project (Storage -> New bucket), or ensure your backend server is running on port 8000.`
              : uploadError.message || "Failed to upload essay image."
          );
          return;
        }
      }

      const submissionId = crypto.randomUUID();
      const { data: savedSubmission, error: submissionError } = await supabase.rpc("submit_assignment", {
        submission_key: submissionId,
        assignment_key: String(selectedAssignment.id),
        title: essayTitle,
        upload_path: uploadedFileUrl,
      });

      // A lost response can follow a committed insert. Confirm using safe metadata.
      const { data: confirmedRows, error: confirmationError } = await supabase.rpc("accessible_submissions");
      const confirmed = !confirmationError && (confirmedRows || []).some((row) => String(row.id) === String(savedSubmission?.id || submissionId));
      if (!confirmed) {
        if (submissionError?.code === "23505") {
          setErrorMessage("You already submitted this assignment.");
          await loadStudentData();
          return;
        }

        setErrorMessage(submissionError?.message || "Could not confirm the save. Refresh your submissions before retrying; your draft is still here.");
        return;
      }

      setSuccessMessage(
        savedSubmission?.already_submitted
          ? "This assignment was already saved. Your existing submission is available below."
          : "Work uploaded successfully! Your handwritten work is being transcribed and automatically checked for plagiarism. Confirmation status will update below."
      );
      resetSubmissionDraft();
      setActivePage("submissions");
      await loadStudentData();
    } catch (error) {
      setErrorMessage(error.message || "Could not submit assignment.");
    } finally {
      setIsSubmittingEssay(false);
    }
  };

  const displayName =
    profile?.full_name || profile?.email || "Student";

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202124]">
      <Header
        profile={profile}
        onProfileUpdated={onProfileUpdated}
        workspace="Student workspace"
        pages={studentPages}
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

        {/* Join Class Modal Dialog */}
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between pb-4 border-b border-[#dadce0]">
                <div>
                  <h3 className="text-xl font-medium text-[#202124]">Join class</h3>
                  <p className="mt-0.5 text-xs text-[#5f6368]">
                    Ask your teacher for the class code, then enter it here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsJoinModalOpen(false);
                    setJoinCode("");
                  }}
                  className="rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleJoinClassroom} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-[#3c4043]">Class code</span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder="e.g. CLAS1234"
                    className="mt-1.5 h-11 w-full rounded-md border border-[#dadce0] px-3 text-sm font-mono uppercase text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    required
                  />
                </label>

                <p className="text-xs text-[#5f6368]">
                  To sign in with a class code: Use an authorized account, and enter a 5–8 character code with letters or numbers and no spaces.
                </p>

                <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#dadce0]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsJoinModalOpen(false);
                      setJoinCode("");
                    }}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isJoiningClassroom}
                    className="rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white hover:bg-[#0f5b28] disabled:bg-gray-300"
                  >
                    {isJoiningClassroom ? "Joining..." : "Join"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Leave Classroom Confirmation Modal */}
        {leavingClassroom && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100">
                  <LeaveIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="leave-modal-title" className="text-lg font-semibold text-[#202124]">
                    Leave classroom?
                  </h3>
                  <p className="mt-1 text-sm text-[#5f6368] leading-relaxed">
                    Are you sure you want to unenroll and leave <span className="font-semibold text-[#202124]">"{leavingClassroom.name}"</span>?
                  </p>
                  <p className="mt-2 text-xs text-[#5f6368]">
                    You will no longer see this class or its assignments. You can rejoin at any time with class code: <code className="font-mono font-bold text-[#202124] bg-gray-100 px-1.5 py-0.5 rounded">{leavingClassroom.code}</code>.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#dadce0]">
                <button
                  type="button"
                  onClick={() => setLeavingClassroom(null)}
                  disabled={isLeaving}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLeaveClassroom}
                  disabled={isLeaving}
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 shadow-xs transition disabled:opacity-50"
                >
                  {isLeaving ? "Leaving..." : "Leave class"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activePage === "classrooms" && openedClassroomId && classrooms.some((c) => c.id === openedClassroomId) && (() => {
          const cls = classrooms.find((c) => c.id === openedClassroomId);
          return (
            <ClassroomDetail
              key={openedClassroomId}
              classroom={cls}
              assignments={assignments}
              teacher={cls?.teacherInfo || { id: cls?.teacherId, name: cls?.teacher || "Teacher", email: "" }}
              onBack={() => setOpenedClassroomId(null)}
              onLeaveClassroom={(classroom) => setLeavingClassroom(classroom)}
              onOpenAssignment={(assignment) => {
                handleViewClassroomAssignments(openedClassroomId);
                handleOpenSubmissionDraft(assignment);
              }}
            />
          );
        })()}

        {/* Classes Page */}
        {activePage === "classrooms" && (!openedClassroomId || !classrooms.some((c) => c.id === openedClassroomId)) && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#dadce0] pb-5">
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-[#202124]">
                  Classes
                </h2>
                <p className="mt-1 text-sm text-[#5f6368]">
                  View your enrolled classes, teacher announcements, and assigned coursework.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setJoinCode("");
                  setIsJoinModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#0f5b28] active:scale-[0.98]"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Join class</span>
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
                {[1, 2].map((n) => (
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
                    ? "All your enrolled classes are currently archived. View past work in the Archived classes tab or ask your teacher for a new class code."
                    : "Ask your teacher for the class code to join your first classroom."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setJoinCode("");
                    setIsJoinModalOpen(true);
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0f5b28]"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Join class</span>
                </button>
              </div>
            ) : classroomTab === "archived" && archivedClassrooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-12 text-center max-w-md mx-auto my-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <ArchiveIcon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-[#202124]">No archived classes</h3>
                <p className="mt-1 text-sm text-[#5f6368]">
                  Classes archived by your teachers will appear here in read-only mode for your records.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visibleClassrooms.map((classroom) => (
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
                            Section {classroom.section} • {classroom.teacher}
                          </p>
                        </div>
                      </div>

                      <div
                        className="group/avatar absolute -bottom-6 right-4 z-10"
                        title={`Instructor & Classroom Creator: ${classroom.teacher || "Teacher"}`}
                      >
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr ${getTeacherAvatarTheme(classroom.teacherId || classroom.teacher).bg} text-white text-lg font-bold shadow-md ring-4 ring-white transition-all duration-200 group-hover/avatar:scale-105 select-none overflow-hidden`}
                        >
                          {classroom.teacherAvatarUrl ? (
                            <img
                              src={classroom.teacherAvatarUrl}
                              alt={classroom.teacher || "Teacher"}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const span = e.currentTarget.parentElement?.querySelector(".avatar-initials-fallback");
                                if (span) span.style.display = "flex";
                              }}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                          <span
                            className="avatar-initials-fallback flex items-center justify-center"
                            style={{ display: classroom.teacherAvatarUrl ? "none" : "flex" }}
                          >
                            {getInitials(classroom.teacher || "Teacher", "TE")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-7 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#5f6368]">
                          <span>{classroom.assignments} assignments</span>
                        </div>
                        {classroom.isArchived && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-200">
                            <ArchiveIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Class is archived (read-only)</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#e0e0e0] flex items-center justify-between text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => handleViewClassroomAssignments(classroom.id)}
                          className="inline-flex items-center gap-1.5 text-[#137333] hover:underline"
                        >
                          <ClipboardIcon className="h-3.5 w-3.5" />
                          <span>View classwork</span>
                        </button>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenedClassroomId(classroom.id)}
                          className="font-medium text-[#137333] hover:underline shrink-0"
                        >
                          {classroom.isArchived ? "View classroom" : "Open classroom"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setLeavingClassroom(classroom)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 transition"
                          title="Unenroll and leave this classroom"
                        >
                          <LeaveIcon className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
                          <span>Leave</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activePage === "assignments" && (
          <div className={selectedAssignment ? "mx-auto w-full max-w-3xl" : ""}>
            {selectedAssignment && (
              <button
                type="button"
                onClick={resetSubmissionDraft}
                disabled={isSubmittingEssay}
                className="mb-5 rounded-lg px-3 py-2 text-sm font-medium text-[#137333] hover:bg-[#e6f4ea] focus:outline-none focus:ring-2 focus:ring-[#137333] disabled:opacity-50"
              >
                ← Back to To do
              </button>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-[#dadce0] pb-5">
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-[#202124]">
                  {selectedAssignment ? "Submit assignment" : "To-do"}
                </h2>
                <p className="mt-1 text-sm text-[#5f6368]">
                  {selectedAssignment ? "Review the instructions below and add your work." : "Work assigned to you across your enrolled classes."}
                </p>
                {selectedClassroom && !selectedAssignment && (
                  <p className="mt-1 text-xs text-[#137333] font-medium">
                    Filtering: {selectedClassroom.name} — Section {selectedClassroom.section}
                  </p>
                )}
              </div>

              {classrooms.length > 1 && !selectedAssignment && (
                <label className="block w-full sm:w-[280px]">
                  <span className="text-xs font-medium text-[#3c4043]">
                    Classroom filter
                  </span>
                  <select
                    value={selectedClassroomId}
                    onChange={(event) => {
                      setSelectedClassroomId(event.target.value);
                      resetSubmissionDraft();
                    }}
                  className="mt-1.5 h-10 w-full rounded-md border border-[#dadce0] bg-white px-3 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  >
                    <option value="">All classes</option>
                    {classrooms.map((classroom) => (
                      <option
                        key={classroom.id}
                        value={classroom.id}
                      >
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {!selectedAssignment && <section className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-[#b06000]" />
                <h3 className="text-lg font-medium text-[#202124]">Due soon</h3>
                <span className="rounded-full bg-[#fef7e0] px-2 py-0.5 text-xs font-medium text-[#b06000]">
                  {dueSoonAssignments.length}
                </span>
              </div>
              {dueSoonAssignments.length === 0 ? (
                <p className="rounded-lg border border-[#dadce0] bg-white px-4 py-3 text-sm text-[#5f6368]">
                  Nothing is due in the next 7 days.
                </p>
              ) : (
                <div className="space-y-3">
                  {dueSoonAssignments.map((assignment) => (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => handleOpenSubmissionDraft(assignment)}
                      className="group flex w-full flex-col gap-3 rounded-xl border border-[#dadce0] bg-white p-4 text-left shadow-2xs transition hover:border-[#137333] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#137333] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fef7e0] text-[#b06000]">
                          <CalendarIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[#202124] group-hover:text-[#137333]">
                            {assignment.title}
                          </span>
                          <p className="mt-1 truncate text-xs text-[#5f6368]">
                            {assignment.classroomName}{assignment.classroomSubject ? ` · ${assignment.classroomSubject}` : assignment.classroomSection ? ` · ${assignment.classroomSection}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-[#b06000] sm:text-right">
                        Due {formatDateTime(assignment.dueDate)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>}

            <section className="mt-8">
              {!selectedAssignment && <div className="mb-3 flex items-center gap-2">
                <ClipboardIcon className="h-5 w-5 text-[#137333]" />
                <h3 className="text-lg font-medium text-[#202124]">To do</h3>
                <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#137333]">
                  {todoAssignments.length}
                </span>
              </div>}
              <div className="mt-6 space-y-4">
                {todoAssignments.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-12 text-center max-w-md mx-auto my-8">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                      <ClipboardIcon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-[#202124]">No work due</h3>
                    <p className="mt-1 text-sm text-[#5f6368]">
                      You're all caught up! When teachers assign new work, it will appear here.
                    </p>
                  </div>
                )}

                {todoAssignments.filter((assignment) => !selectedAssignment || assignment.id === selectedAssignment.id).map((assignment) => {
                  const isDraftOpen =
                    submissionDraft.assignmentId === assignment.id;

                  const submissionBlockMessage =
                    isDraftOpen
                      ? getSubmissionBlockMessage(submissionDraft, submissionFile)
                      : "";

                  return (
                    <article
                      key={assignment.id}
                      className="rounded-xl border border-[#dadce0] bg-white p-5 shadow-2xs hover:shadow-xs transition duration-150"
                    >
                      <button
                        type="button"
                        aria-expanded={isDraftOpen}
                        aria-controls={`assignment-draft-${assignment.id}`}
                        onClick={() => {
                          if (!isDraftOpen) handleOpenSubmissionDraft(assignment);
                        }}
                        className="flex w-full flex-col gap-3 rounded-lg text-left transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-[#137333] sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                            <ClipboardIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-medium text-[#202124]">
                              {assignment.title}
                            </h3>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#5f6368]">
                              <span className="font-medium text-[#202124]">{assignment.classroomName}</span>
                              <span>•</span>
                              <span>{assignment.classroomSubject || assignment.classroomSection}</span>
                              <span>•</span>
                              <span className={assignment.dueInfo.isOverdue ? "font-medium text-[#c5221f]" : ""}>
                                Due {formatDateTime(assignment.dueDate)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${assignment.dueInfo.badgeColor}`}
                        >
                          {assignment.dueInfo.isOverdue && <AlertCircleIcon className="h-3.5 w-3.5" />}
                          {assignment.dueInfo.label}
                        </span>
                      </button>

                      {assignment.instructions && (
                        <p className="mt-2.5 sm:mt-3 text-xs text-[#5f6368] leading-relaxed pl-0 sm:pl-14">
                          {assignment.instructions}
                        </p>
                      )}

                      {!isDraftOpen && <div className="mt-3.5 sm:mt-4 flex flex-wrap gap-2.5 sm:gap-3 pl-0 sm:pl-14">
                        {assignment.submitted ? (
                          <button
                            type="button"
                            onClick={() =>
                              openSubmissionFile(
                                assignment.submission?.file_url || assignment.submission?.fileUrl,
                                setErrorMessage
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333]"
                          >
                            <FileIcon className="h-3.5 w-3.5 text-[#5f6368]" />
                            <span>View submission</span>
                          </button>
                        ) : classrooms.find((c) => c.id === assignment.classroomId)?.isArchived ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800">
                            <ArchiveIcon className="h-3.5 w-3.5" />
                            <span>Class is archived (Submissions closed)</span>
                          </span>
                        ) : assignment.dueInfo.isOverdue && assignment.acceptLateSubmissions === false ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700">
                            <AlertCircleIcon className="h-3.5 w-3.5" />
                            <span>Submissions closed (Late submissions disabled)</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              isDraftOpen
                                ? resetSubmissionDraft()
                                : handleOpenSubmissionDraft(assignment)
                            }
                            className={
                              isDraftOpen
                                ? "inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-xs font-medium text-[#c5221f] hover:bg-red-50"
                                : "inline-flex items-center gap-1.5 rounded-full bg-[#137333] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#0f5b28]"
                            }
                          >
                            {isDraftOpen ? "Cancel" : "Add or create"}
                          </button>
                        )}
                      </div>}

                    {isDraftOpen && !assignment.submitted && (
                      <form
                        id={`assignment-draft-${assignment.id}`}
                        onSubmit={handleSubmitAssignment}
                        className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5"
                      >
                        <label className="block">
                          <span className="text-sm font-extrabold text-gray-800">
                            Essay title
                          </span>
                          <input
                            type="text"
                            value={submissionDraft.essayTitle}
                            onChange={(event) =>
                              setSubmissionDraft((currentDraft) => ({
                                ...currentDraft,
                                essayTitle: event.target.value,
                              }))
                            }
                            className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                            required
                          />
                        </label>

                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                          {submissionModes.map(({ id, label, icon: Icon }) => {
                            const isActive =
                              submissionDraft.mode === id;

                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => handleSubmissionModeChange(id)}
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

                        <div className="mt-5">
                          {!submissionDraft.mode && (
                            <div className="grid min-h-[260px] place-items-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 text-center">
                              <div>
                                <span className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                                  <UploadIcon className="h-8 w-8" />
                                </span>
                                <h3 className="mt-5 text-xl font-black text-gray-950">
                                  Choose a submission type first
                                </h3>
                              </div>
                            </div>
                          )}

                          {(submissionDraft.mode === "picture" || submissionDraft.mode === "file") && (
                            <>
                              <label className="flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 text-center transition hover:border-emerald-600 hover:bg-emerald-50">
                                {filePreview ? (
                                  <img
                                    src={filePreview}
                                    alt="Selected submission preview"
                                    className="max-h-[260px] w-full rounded-lg object-contain"
                                  />
                                ) : (
                                  <>
                                    <span className="grid h-20 w-20 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                                      {submissionDraft.mode === "picture" ? (
                                        <ImageIcon className="h-10 w-10" />
                                      ) : (
                                        <UploadIcon className="h-10 w-10" />
                                      )}
                                    </span>
                                    <span className="mt-6 text-2xl font-black text-gray-950">
                                      {submissionDraft.mode === "picture" ? "Upload a picture" : "Upload a file"}
                                    </span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept={
                                    submissionDraft.mode === "picture"
                                      ? "image/png,image/jpeg,image/jpg,image/webp"
                                      : ACCEPTED_CHECK_FILE_TYPES
                                  }
                                  onChange={(event) =>
                                    setSubmissionFile(event.target.files?.[0] ?? null)
                                  }
                                  className="sr-only"
                                />
                              </label>

                              {submissionFile && (
                                <div className="mt-5 rounded-lg border border-gray-200 bg-white">
                                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 px-4 py-3 text-xs font-extrabold uppercase tracking-normal text-gray-500">
                                    <span>File</span>
                                    <span>Type</span>
                                    <span>Size</span>
                                  </div>

                                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm">
                                    <span className="min-w-0 truncate font-extrabold text-gray-950">
                                      {submissionFile.name}
                                    </span>
                                    <span className="font-bold text-gray-500">
                                      {getFileKind(submissionFile)}
                                    </span>
                                    <span className="font-bold text-gray-500">
                                      {formatFileSize(submissionFile.size)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {submissionDraft.mode === "text" && (
                            <label className="block">
                              <span className="text-sm font-extrabold text-gray-800">
                                Paste text
                              </span>
                              <textarea
                                value={submissionDraft.text}
                                onChange={(event) =>
                                  setSubmissionDraft((currentDraft) => ({
                                    ...currentDraft,
                                    text: event.target.value,
                                  }))
                                }
                                className="mt-2 min-h-[300px] w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm font-semibold leading-6 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                              />
                            </label>
                          )}
                        </div>

                        {(errorMessage || successMessage) && (
                          <div className="mt-5">
                            <StatusMessage
                              error={errorMessage || submissionSyncError}
                              message={successMessage}
                            />
                          </div>
                        )}

                        {submissionBlockMessage && (
                          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                            {submissionBlockMessage}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmittingEssay}
                          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-base font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        >
                          <UploadIcon className="h-5 w-5" />
                          {isSubmittingEssay ? "Submitting..." : "Submit assignment"}
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
            </section>
          </div>
        )}

        {activePage === "submissions" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#dadce0] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#e6f4ea] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[#137333]">
                    My Work
                  </span>
                </div>
                <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#202124]">
                  Submissions
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
                  Review your turned in assignments, automated submission processing status, and teacher feedback.
                </p>
              </div>

              {/* Quick stats pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3.5 py-1.5 text-xs font-semibold shadow-2xs">
                  <span className="text-[#202124]">{submissionStats.total}</span>
                  <span className="text-[#5f6368]">total turned in</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-[#ceead6] bg-[#e6f4ea] px-3.5 py-1.5 text-xs font-semibold text-[#137333] shadow-2xs">
                  <span>{submissionStats.graded}</span>
                  <span>graded</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-[#c2e7ff] bg-[#e8f0fe] px-3.5 py-1.5 text-xs font-semibold text-[#1967d2] shadow-2xs">
                  <span>{submissionStats.awaiting}</span>
                  <span>awaiting review</span>
                </div>
              </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-2xl border border-[#dadce0] bg-white p-3.5 sm:p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6368]" />
                  <input
                    type="search"
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                    placeholder="Search by assignment, essay, or class..."
                    className="h-10 w-full rounded-lg border border-[#dadce0] bg-white pl-9 pr-8 text-xs sm:text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] placeholder:text-[#80868b]"
                  />
                  {submissionSearch && (
                    <button
                      type="button"
                      onClick={() => setSubmissionSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#202124] p-1 rounded-full hover:bg-gray-100"
                      title="Clear search"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Classroom Filter */}
                {classrooms.length > 0 && (
                  <select
                    value={submissionClassroomId}
                    onChange={(e) => setSubmissionClassroomId(e.target.value)}
                    className="h-10 rounded-lg border border-[#dadce0] bg-white px-3 text-xs sm:text-sm font-medium text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea] max-w-full sm:max-w-[220px] truncate"
                  >
                    <option value="all">All classes ({classrooms.length})</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.section ? `— ${c.section}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Status Chips and Sort */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: "all", label: "All", count: submissionStats.total },
                    { id: "graded", label: "Graded", count: submissionStats.graded },
                    { id: "awaiting", label: "Awaiting review", count: submissionStats.awaiting },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSubmissionStatusFilter(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        submissionStatusFilter === tab.id
                          ? "bg-[#137333] text-white shadow-2xs"
                          : "bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8eaed] hover:text-[#202124]"
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                <select
                  value={submissionSort}
                  onChange={(e) => setSubmissionSort(e.target.value)}
                  className="h-9 rounded-lg border border-[#dadce0] bg-white px-2.5 text-xs font-medium text-[#202124] outline-none transition focus:border-[#137333]"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="grade">Highest grade</option>
                  <option value="assignment">Assignment (A–Z)</option>
                </select>
              </div>
            </div>

            {/* Submissions Table / Card Container */}
            <div className="overflow-hidden rounded-2xl border border-[#dadce0] bg-white shadow-2xs">
              {submissions.length === 0 ? (
                <div className="p-12 text-center max-w-md mx-auto">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e6f4ea] text-[#137333]">
                    <ClipboardIcon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-base sm:text-lg font-bold text-[#202124]">
                    No submissions turned in yet
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#5f6368]">
                    When you turn in work from the To-do tab, your grades, originality checks, and teacher feedback will be displayed here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage("assignments")}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#137333] px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-[#0f5b28]"
                  >
                    <span>Go to To-do</span>
                  </button>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="p-10 text-center max-w-md mx-auto">
                  <p className="text-sm font-medium text-[#202124]">
                    No submissions match your search or filter.
                  </p>
                  <p className="mt-1 text-xs text-[#5f6368]">
                    Try changing your search terms or selecting another classroom.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionSearch("");
                      setSubmissionClassroomId("all");
                      setSubmissionStatusFilter("all");
                      setSubmissionSort("newest");
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-xs font-semibold text-[#3c4043] hover:bg-[#f8f9fa]"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <div className="min-w-[720px]">
                    {/* Table Header */}
                    <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(180px,1.2fr)_minmax(140px,0.9fr)_minmax(130px,0.9fr)_minmax(110px,auto)] gap-4 border-b border-[#dadce0] bg-[#f8f9fa] px-5 py-3.5 text-xs font-semibold text-[#5f6368]">
                      <span>Assignment & Class</span>
                      <span>Submitted Work</span>
                      <span>Grade</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>

                    {/* Table Rows */}
                    <div className="divide-y divide-[#dadce0]">
                      {filteredSubmissions.map((submission) => (
                        <div
                          key={submission.id}
                          className="grid grid-cols-[minmax(220px,1.4fr)_minmax(180px,1.2fr)_minmax(140px,0.9fr)_minmax(130px,0.9fr)_minmax(110px,auto)] items-center gap-4 px-5 py-4 text-sm transition hover:bg-[#f8f9fa]/80"
                        >
                          {/* Assignment & Classroom */}
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-[#202124] truncate">
                              {submission.assignmentTitle}
                            </p>
                            <p className="mt-0.5 text-xs text-[#5f6368] truncate">
                              {submission.classroomName}
                              {submission.classroomSection ? ` • Section ${submission.classroomSection}` : ""}
                            </p>
                          </div>

                          {/* Submitted Work */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#e8f0fe] text-[#1967d2]">
                                <FileIcon className="h-3.5 w-3.5" />
                              </span>
                              <p className="text-xs sm:text-sm font-medium text-[#202124] truncate">
                                {submission.essayTitle}
                              </p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-[#5f6368]">
                                {formatDateTime(submission.createdAt)}
                              </span>
                              {submission.feedback && (
                                <span className="inline-flex items-center gap-1 rounded bg-[#e6f4ea] px-1.5 py-0.5 text-[10px] font-bold text-[#137333]">
                                  <CheckIcon className="h-3 w-3" /> Teacher feedback
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Grade */}
                          <div>
                            {submission.returnedAt && String(submission.grade ?? "").trim() !== "" ? (
                              <span className="inline-flex items-center rounded-md border border-[#ceead6] bg-[#e6f4ea] px-2.5 py-1 text-xs font-bold text-[#137333] shadow-2xs">
                                {submission.grade} / 100
                              </span>
                            ) : submission.returnedAt && submission.feedback ? (
                              <span className="text-xs font-semibold text-[#137333]">
                                Feedback released
                              </span>
                            ) : submission.status === "graded" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#5f6368] italic">
                                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                                </svg>
                                Grade not released yet
                              </span>
                            ) : (
                              <span className="text-xs text-[#5f6368] italic">
                                Awaiting review
                              </span>
                            )}
                          </div>

                          {/* Status & Similarity */}
                          <div className="space-y-1">
                            <div>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                submission.returnedAt ? "bg-[#e6f4ea] text-[#137333] border border-[#ceead6]" :
                                submission.processingState && submission.processingState !== "ready" ? "bg-[#fef7e0] text-[#b06000] border border-[#fdd663] animate-pulse" :
                                submission.status === "graded" ? "bg-[#e6f4ea] text-[#137333]" :
                                "bg-[#e8f0fe] text-[#1967d2] border border-[#c2e7ff]"
                              }`}>
                                {submission.returnedAt ? "Returned" : submission.processingState && submission.processingState !== "ready" ? processingLabel(submission.processingState) : submission.status === "graded" ? "Graded" : "Turned in"}
                              </span>
                            </div>
                            <div>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                submission.processingState === "ready" || submission.hasPlagiarismChecked || submission.returnedAt || submission.status === "graded"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : submission.processingState === "failed"
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {submission.processingState === "ready" || submission.hasPlagiarismChecked || submission.returnedAt || submission.status === "graded"
                                  ? "Plagiarism Checked"
                                  : submission.processingState === "failed"
                                    ? "Needs attention"
                                    : "Transcribing & Checking..."}
                              </span>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setViewingSubmission(submission);
                                setStudentCopySuccess(false);
                                setIsStudentImageExpanded(false);
                                setStudentImagePreviewUrl("");
                                const fileUrl = submission.fileUrl;
                                if (!fileUrl) return;
                                resolveStorageImageUrl(fileUrl)
                                  .then((resolvedUrl) => {
                                    if (resolvedUrl) setStudentImagePreviewUrl(resolvedUrl);
                                  })
                                  .catch((err) => {
                                    console.warn("Failed to resolve student preview URL:", err);
                                  });
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3c4043] transition hover:bg-[#f8f9fa] hover:border-[#137333] hover:text-[#137333] shadow-2xs active:scale-[0.98]"
                            >
                              <FileSearchIcon className="h-3.5 w-3.5 text-[#5f6368]" />
                              <span>View details</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Student Submission Detail Modal */}
        {viewingSubmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
            <div className="relative max-h-[92vh] w-full max-w-4xl lg:max-w-5xl overflow-y-auto overflow-x-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                <div>
                  <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 uppercase tracking-wider">
                    My Submission
                  </span>
                  <h3 className="mt-1.5 text-2xl font-black text-gray-950">
                    {viewingSubmission.essayTitle}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-gray-500">
                    {viewingSubmission.assignmentTitle} • Submitted {formatDateTime(viewingSubmission.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewingSubmission(null);
                    setStudentImagePreviewUrl("");
                    setIsStudentImageExpanded(false);
                    setStudentCopySuccess(false);
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {/* Submitted Image Preview */}
                {studentImagePreviewUrl && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Submitted image</p>
                    <div
                      className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm"
                      onClick={() => setIsStudentImageExpanded(true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setIsStudentImageExpanded(true)}
                      style={{ maxHeight: "280px" }}
                    >
                      <img
                        src={studentImagePreviewUrl}
                        alt="Your submission"
                        className="w-full object-contain transition duration-200 group-hover:brightness-90"
                        style={{ maxHeight: "280px" }}
                        onError={(e) => e.target.closest(".group").style.display = "none"}
                      />
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        Expand
                      </div>
                    </div>
                  </div>
                )}

                {/* Lightbox */}
                {isStudentImageExpanded && studentImagePreviewUrl && (
                  <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                    onClick={() => setIsStudentImageExpanded(false)}
                  >
                    <div className="relative max-h-[95vh] max-w-[95vw]">
                      <button
                        type="button"
                        onClick={() => setIsStudentImageExpanded(false)}
                        className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white font-bold text-gray-800 shadow-lg hover:bg-gray-100 text-sm"
                      >✕</button>
                      <img
                        src={studentImagePreviewUrl}
                        alt="Your submission full view"
                        className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-2 text-center text-xs font-semibold text-white/70">
                        {viewingSubmission.essayTitle}
                      </p>
                    </div>
                  </div>
                )}

                {/* Grade & Status Banner */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Grade</p>
                      {viewingSubmission.returnedAt && String(viewingSubmission.grade ?? "").trim() !== "" ? (
                        <p className="mt-1 text-3xl font-black text-emerald-700">{viewingSubmission.grade}</p>
                      ) : (
                        <p className="mt-1 text-lg font-extrabold text-gray-400">{viewingSubmission.status === "graded" ? "Grade not released yet" : "Awaiting review"}</p>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Status</p>
                      <p className={`mt-1 text-lg font-extrabold capitalize ${
                        viewingSubmission.status === "graded" ? "text-emerald-700" :
                        viewingSubmission.status === "submitted" ? "text-blue-600" : "text-gray-500"
                      }`}>{viewingSubmission.returnedAt ? "Returned" : viewingSubmission.processingState && viewingSubmission.processingState !== "ready" ? processingLabel(viewingSubmission.processingState) : viewingSubmission.status === "graded" ? "Graded" : processingLabel(viewingSubmission.processingState)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openSubmissionFile(viewingSubmission.fileUrl, setErrorMessage)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50 shadow-sm transition"
                    >
                      <FileSearchIcon className="h-4 w-4 text-gray-500" />
                      Open file
                    </button>
                  </div>

                  {/* Teacher Feedback */}
                  {viewingSubmission.feedback && (
                    <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Teacher Feedback</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-900 leading-6">{viewingSubmission.feedback}</p>
                    </div>
                  )}
                </div>

                {/* Submission Confirmation & Automated Processing Status */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                        Submission Pipeline Status
                      </p>
                      <h4 className="mt-1 text-lg font-black text-gray-950">
                        Automated Processing Confirmation
                      </h4>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-extrabold text-emerald-800">
                      {viewingSubmission.processingState === "ready" || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                        ? "Processing Complete"
                        : viewingSubmission.processingState === "failed"
                          ? "Processing Needs Attention"
                          : "Processing In Progress"}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-medium text-gray-500">
                    Your handwritten submission is automatically processed through our YOLO line-detection and TrOCR handwriting transcription pipeline, followed by automatic plagiarism checking.
                  </p>

                  {/* 4-Step Verification Workflow Display */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {/* Step 1: Upload */}
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3.5">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                        <CheckIcon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-emerald-950">
                          1. Work Uploaded Successfully
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
                          Handwritten work image safely received and stored.
                        </p>
                      </div>
                    </div>

                    {/* Step 2: YOLO -> TrOCR Transcription */}
                    <div className={`flex items-start gap-3 rounded-lg border p-3.5 ${
                      viewingSubmission.processingState === "ready" || viewingSubmission.hasTranscribed || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                        ? "border-emerald-100 bg-emerald-50/60"
                        : viewingSubmission.processingState === "failed"
                          ? "border-red-100 bg-red-50/60"
                          : "border-amber-100 bg-amber-50/60"
                    }`}>
                      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                        viewingSubmission.processingState === "ready" || viewingSubmission.hasTranscribed || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                          ? "bg-emerald-600 text-white"
                          : viewingSubmission.processingState === "failed"
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                      }`}>
                        {viewingSubmission.processingState === "ready" || viewingSubmission.hasTranscribed || viewingSubmission.returnedAt || viewingSubmission.status === "graded" ? "✓" : "2"}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-gray-900">
                          2. Handwritten Text Transcribed
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-gray-600">
                          {viewingSubmission.processingState === "ready" || viewingSubmission.hasTranscribed || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                            ? "YOLO detected handwriting lines & TrOCR converted to text."
                            : "YOLO line detection & TrOCR transcription in progress..."}
                        </p>
                      </div>
                    </div>

                    {/* Step 3: Transcribed Text Recorded */}
                    <div className={`flex items-start gap-3 rounded-lg border p-3.5 ${
                      viewingSubmission.processingState === "ready" || viewingSubmission.hasRecorded || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                        ? "border-emerald-100 bg-emerald-50/60"
                        : viewingSubmission.processingState === "failed"
                          ? "border-red-100 bg-red-50/60"
                          : "border-amber-100 bg-amber-50/60"
                    }`}>
                      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                        viewingSubmission.processingState === "ready" || viewingSubmission.hasRecorded || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                          ? "bg-emerald-600 text-white"
                          : viewingSubmission.processingState === "failed"
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                      }`}>
                        {viewingSubmission.processingState === "ready" || viewingSubmission.hasRecorded || viewingSubmission.returnedAt || viewingSubmission.status === "graded" ? "✓" : "3"}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-gray-900">
                          3. Transcribed Text Recorded
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-gray-600">
                          {viewingSubmission.processingState === "ready" || viewingSubmission.hasRecorded || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                            ? "Transcribed text formatted and securely stored."
                            : "Recording transcribed text to submission record..."}
                        </p>
                      </div>
                    </div>

                    {/* Step 4: Plagiarism Check */}
                    <div className={`flex items-start gap-3 rounded-lg border p-3.5 ${
                      viewingSubmission.processingState === "ready" || viewingSubmission.hasPlagiarismChecked || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                        ? "border-emerald-100 bg-emerald-50/60"
                        : viewingSubmission.processingState === "failed"
                          ? "border-red-100 bg-red-50/60"
                          : "border-amber-100 bg-amber-50/60"
                    }`}>
                      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                        viewingSubmission.processingState === "ready" || viewingSubmission.hasPlagiarismChecked || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                          ? "bg-emerald-600 text-white"
                          : viewingSubmission.processingState === "failed"
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                      }`}>
                        {viewingSubmission.processingState === "ready" || viewingSubmission.hasPlagiarismChecked || viewingSubmission.returnedAt || viewingSubmission.status === "graded" ? "✓" : "4"}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-gray-900">
                          4. Plagiarism Check Processed
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-gray-600">
                          {viewingSubmission.processingState === "ready" || viewingSubmission.hasPlagiarismChecked || viewingSubmission.returnedAt || viewingSubmission.status === "graded"
                            ? "Submission has gone through the plagiarism checking process."
                            : "Running automatic plagiarism analysis..."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Confidentiality Notice */}
                  <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs font-semibold text-blue-900">
                    <svg className="h-4 w-4 shrink-0 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    <span>
                      Plagiarism detection results and similarity metrics are confidential and sent directly to your teacher's evaluation workspace.
                    </span>
                  </div>
                </div>

                {/* Transcribed Text Display (without plagiarism highlights) */}
                {viewingSubmission.transcribedText && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-gray-900">
                          Transcribed handwritten text
                        </p>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                          YOLO + TrOCR
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(viewingSubmission.transcribedText);
                          setStudentCopySuccess(true);
                          setTimeout(() => setStudentCopySuccess(false), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:text-emerald-900 transition"
                      >
                        {studentCopySuccess ? (
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
                    </div>
                    <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm font-medium leading-relaxed text-gray-800 whitespace-pre-wrap font-sans border border-gray-200">
                      {viewingSubmission.transcribedText}
                    </div>
                  </div>
                )}

                {/* Close button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewingSubmission(null);
                      setStudentImagePreviewUrl("");
                      setIsStudentImageExpanded(false);
                      setStudentCopySuccess(false);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-xs font-extrabold text-gray-700 transition hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
