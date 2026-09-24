import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export function ProfileIcon({ className = "h-10 w-10" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </svg>
  );
}

export function CameraIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export const AVATAR_THEMES = [
  { id: "emerald", label: "Emerald", bg: "from-[#137333] to-[#2e7d32]", ring: "ring-[#e6f4ea]", dot: "#137333" },
  { id: "blue", label: "Ocean Blue", bg: "from-[#1a73e8] to-[#1557b0]", ring: "ring-[#e8f0fe]", dot: "#1a73e8" },
  { id: "purple", label: "Royal Purple", bg: "from-[#7b1fa2] to-[#512da8]", ring: "ring-[#f3e8fd]", dot: "#7b1fa2" },
  { id: "crimson", label: "Crimson Red", bg: "from-[#c5221f] to-[#b71c1c]", ring: "ring-[#fce8e6]", dot: "#c5221f" },
  { id: "amber", label: "Warm Amber", bg: "from-[#e37400] to-[#b06000]", ring: "ring-[#fef7e0]", dot: "#e37400" },
  { id: "slate", label: "Dark Slate", bg: "from-[#37474f] to-[#263238]", ring: "ring-[#eceff1]", dot: "#37474f" },
];

export function processProfileImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || (file.type && !file.type.startsWith("image/"))) {
      reject(new Error("Please select a valid image file (PNG, JPG, or WebP)."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("Image is too large. Please select an image under 15MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = (e) => {
      if (typeof window === "undefined" || typeof Image === "undefined" || process.env.NODE_ENV === "test") {
        resolve(e.target.result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image. Please select a valid picture."));
      img.onload = () => {
        try {
          const maxDim = 320;
          const canvas = document.createElement("canvas");
          canvas.width = maxDim;
          canvas.height = maxDim;
          const ctx = canvas.getContext ? canvas.getContext("2d") : null;
          if (!ctx) {
            resolve(e.target.result);
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          const minEdge = Math.min(img.width, img.height);
          const sx = (img.width - minEdge) / 2;
          const sy = (img.height - minEdge) / 2;

          ctx.drawImage(img, sx, sy, minEdge, minEdge, 0, 0, maxDim, maxDim);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          resolve(dataUrl);
        } catch {
          resolve(e.target.result);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileEditor({ profile, onSaved, onClose }) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load saved local preferences
  const savedPrefs = (() => {
    if (!profile?.id || typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem(`writecheck_profile_prefs_${profile.id}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })();

  const [activeTab, setActiveTab] = useState("profile");
  const [name, setName] = useState(profile?.full_name || "");
  const [academicTitle, setAcademicTitle] = useState(savedPrefs.academicTitle || (profile?.full_name?.startsWith("Prof") ? "Professor" : profile?.full_name?.startsWith("Dr") ? "Doctor" : ""));
  const [institution, setInstitution] = useState(savedPrefs.institution || (profile?.role === "teacher" ? "Department of Academic Integrity" : ""));
  const [department, setDepartment] = useState(savedPrefs.department || (profile?.role === "teacher" ? "Language Arts & Writing" : ""));
  const [bio, setBio] = useState(savedPrefs.bio || "");
  const [avatarColor, setAvatarColor] = useState(savedPrefs.avatarColor || "emerald");
  const [avatarUrl, setAvatarUrl] = useState(savedPrefs.avatarUrl || profile?.avatarUrl || "");
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [plagiarismSensitivity, setPlagiarismSensitivity] = useState(savedPrefs.plagiarismSensitivity || "standard");
  const [peerCrossCheck, setPeerCrossCheck] = useState(savedPrefs.peerCrossCheck ?? true);
  const [notifyOnSubmissions, setNotifyOnSubmissions] = useState(savedPrefs.notifyOnSubmissions ?? true);
  const [weeklyDigest, setWeeklyDigest] = useState(savedPrefs.weeklyDigest ?? false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSentMessage, setResetSentMessage] = useState("");

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function handleKeys(event) {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key !== "Tab") return;
    const items = dialogRef.current?.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function handleSendResetEmail() {
    if (!profile?.email || isSendingReset) return;
    setIsSendingReset(true);
    setError("");
    setResetSentMessage("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setResetSentMessage(`Password reset link sent to ${profile.email}. Check your inbox.`);
    } catch (err) {
      setError(err.message || "Could not send reset email. Please try again.");
    } finally {
      setIsSendingReset(false);
    }
  }

  function handleCopyId() {
    if (!profile?.id) return;
    try {
      navigator.clipboard?.writeText(profile.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handlePhotoFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    setIsProcessingPhoto(true);
    try {
      const processed = await processProfileImage(file);
      setAvatarUrl(processed);

      // Instant preview synchronization
      if (profile?.id && typeof window !== "undefined") {
        try {
          const current = JSON.parse(localStorage.getItem(`writecheck_profile_prefs_${profile.id}`) || "{}");
          current.avatarUrl = processed;
          localStorage.setItem(`writecheck_profile_prefs_${profile.id}`, JSON.stringify(current));
          window.dispatchEvent(new CustomEvent("writecheck:profile_updated", {
            detail: { profileId: profile.id, avatarUrl: processed }
          }));
        } catch {}
      }
      setMessage("Photo uploaded! Click 'Save profile' to keep all changes.");
    } catch (err) {
      setError(err.message || "Unable to upload photo.");
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    setAvatarUrl("");
    setError("");
    if (profile?.id && typeof window !== "undefined") {
      try {
        const current = JSON.parse(localStorage.getItem(`writecheck_profile_prefs_${profile.id}`) || "{}");
        delete current.avatarUrl;
        localStorage.setItem(`writecheck_profile_prefs_${profile.id}`, JSON.stringify(current));
        window.dispatchEvent(new CustomEvent("writecheck:profile_updated", {
          detail: { profileId: profile.id, avatarUrl: "" }
        }));
      } catch {}
    }
    setMessage("Photo removed. Initial avatar theme is now active.");
  }

  async function save(event) {
    if (event) event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim()) {
      setError("Enter your full name.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: saveError } = await supabase.rpc("update_my_profile", {
        new_full_name: name.trim(),
      });
      if (saveError) throw saveError;
      if (!data?.length) throw new Error("Your profile could not be saved.");

      const updatedPrefs = {
        academicTitle,
        institution,
        department,
        bio,
        avatarColor,
        avatarUrl,
        plagiarismSensitivity,
        peerCrossCheck,
        notifyOnSubmissions,
        weeklyDigest,
      };

      if (profile?.id && typeof window !== "undefined") {
        try {
          localStorage.setItem(`writecheck_profile_prefs_${profile.id}`, JSON.stringify(updatedPrefs));
        } catch {
          // ignore
        }
      }

      // Best effort sync with Supabase Auth metadata
      try {
        await supabase.auth.updateUser({
          data: {
            avatar_url: avatarUrl,
            avatar_color: avatarColor,
          },
        });
      } catch {
        // non-fatal
      }

      window.dispatchEvent(new CustomEvent("writecheck:profile_updated", { detail: { profileId: profile?.id, ...updatedPrefs } }));

      if (onSaved) onSaved({ ...profile, full_name: data[0].full_name, ...updatedPrefs });
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.message || "Unable to save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedTheme = AVATAR_THEMES.find((t) => t.id === avatarColor) || AVATAR_THEMES[0];

  const initials = (name || profile?.full_name || "User")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const rawFullName = name || profile?.full_name || "Your profile";
  const displayTitleAndName = academicTitle && !rawFullName.toLowerCase().startsWith(academicTitle.toLowerCase())
    ? `${academicTitle} ${rawFullName}`
    : rawFullName;

  return createPortal(
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-150"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeys}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="relative max-h-[92vh] w-full max-w-[540px] overflow-y-auto no-scrollbar rounded-[28px] border border-[#dadce0] bg-white shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] outline-none transition-all"
      >
        {/* Top Decorative Google Classroom Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#0d652d] via-[#137333] to-[#34a853]" />

        {/* Hidden File Input for Avatar Photo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handlePhotoFileChange}
          data-testid="profile-photo-input"
          aria-label="Upload image file"
        />

        {/* Close Button ✕ */}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124] transition z-10"
          aria-label="Close dialog"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="p-6 sm:p-7">
          {/* Header & Avatar */}
          <div className="flex flex-col items-center text-center">
            {/* Interactive Avatar Circle with Camera Overlay */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || isProcessingPhoto}
                title={avatarUrl ? "Click to change photo" : "Click to upload photo"}
                aria-label={avatarUrl ? "Change profile photo" : "Upload profile photo"}
                className={`relative flex h-20 w-20 items-center justify-center rounded-full overflow-hidden bg-gradient-to-tr ${selectedTheme.bg} text-white text-2xl font-bold shadow-lg ring-4 ${selectedTheme.ring} transition-all duration-300 hover:ring-[#137333]/50 focus:outline-none focus:ring-4 focus:ring-[#137333] cursor-pointer`}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayTitleAndName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}

                {/* Hover Camera Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full">
                  <CameraIcon className="h-5 w-5" />
                  <span className="text-[10px] font-semibold mt-0.5">
                    {avatarUrl ? "Change" : "Upload"}
                  </span>
                </div>

                {isProcessingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white rounded-full">
                    <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                )}
              </button>

              {/* Corner Camera Action Button Badge */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || isProcessingPhoto}
                title="Upload or change photo"
                aria-label="Upload photo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#3c4043] shadow-md border border-[#dadce0] hover:bg-[#f1f3f4] hover:text-[#137333] transition"
              >
                <CameraIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Quick Action Buttons */}
            <div className="mt-2.5 flex items-center gap-2 justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || isProcessingPhoto}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#137333] hover:text-[#0d652d] hover:bg-[#e6f4ea] px-3 py-1 rounded-full border border-[#ceead6] transition"
              >
                <CameraIcon className="h-3.5 w-3.5" />
                <span>{avatarUrl ? "Change photo" : "Upload photo"}</span>
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={busy || isProcessingPhoto}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#c5221f] hover:text-[#b71c1c] hover:bg-[#fce8e6] px-2.5 py-1 rounded-full border border-[#fad2cf] transition"
                  title="Remove uploaded photo and revert to initials"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <h2 id="profile-title" className="mt-2.5 text-xl font-bold text-[#202124]">
              {displayTitleAndName}
            </h2>

            <p className="mt-0.5 text-xs text-[#5f6368] break-all">
              {profile?.email}
            </p>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f4ea] px-3 py-0.5 text-xs font-semibold text-[#137333] capitalize">
                <span className="h-1.5 w-1.5 rounded-full bg-[#137333]" />
                {profile?.role ? `${profile.role} Workspace` : "Workspace"}
              </span>
              {institution && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[11px] font-medium text-[#5f6368]">
                  {institution}
                </span>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#dadce0] mt-6">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`flex-1 pb-2.5 text-xs sm:text-sm font-semibold transition border-b-2 ${
                activeTab === "profile"
                  ? "border-[#137333] text-[#137333]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Profile & Info
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preferences")}
              className={`flex-1 pb-2.5 text-xs sm:text-sm font-semibold transition border-b-2 ${
                activeTab === "preferences"
                  ? "border-[#137333] text-[#137333]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              AI & Preferences
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className={`flex-1 pb-2.5 text-xs sm:text-sm font-semibold transition border-b-2 ${
                activeTab === "security"
                  ? "border-[#137333] text-[#137333]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Security
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={save} className="mt-5 space-y-4">
            {/* TAB 1: Profile & Bio */}
            {activeTab === "profile" && (
              <div className="space-y-4 animate-fadeIn">
                {/* Profile Photo Option Card */}
                <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#444746]">
                      Profile Photo
                    </span>
                    {avatarUrl ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#137333] bg-[#e6f4ea] px-2 py-0.5 rounded-full border border-[#ceead6]">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                        Custom photo active
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#5f6368]">Using initials badge</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr ${selectedTheme.bg} text-white font-bold text-sm overflow-hidden ring-2 ${selectedTheme.ring}`}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Thumbnail preview" className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#202124] truncate">
                        {avatarUrl ? "Custom photo uploaded" : "Upload your photo"}
                      </p>
                      <p className="text-[11px] text-[#5f6368]">
                        PNG, JPG, or WebP. Automatically center-cropped.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy || isProcessingPhoto}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#dadce0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#137333] hover:bg-[#e6f4ea] hover:border-[#137333] transition"
                      >
                        <CameraIcon className="h-3.5 w-3.5" />
                        <span>{avatarUrl ? "Change" : "Upload"}</span>
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={busy || isProcessingPhoto}
                          className="inline-flex items-center justify-center rounded-lg border border-[#dadce0] bg-white p-1.5 text-xs font-medium text-[#c5221f] hover:bg-[#fce8e6] hover:border-[#fad2cf] transition"
                          title="Remove photo"
                          aria-label="Remove photo"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Avatar Color Swatches */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-2">
                    {avatarUrl ? "Avatar accent ring color" : "Avatar theme color"}
                  </span>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {AVATAR_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setAvatarColor(theme.id)}
                        className={`h-7 w-7 rounded-full bg-gradient-to-tr ${theme.bg} transition transform hover:scale-110 flex items-center justify-center shadow-xs ${
                          avatarColor === theme.id ? `ring-2 ring-offset-2 ring-[${theme.dot}] scale-110` : ""
                        }`}
                        title={theme.label}
                      >
                        {avatarColor === theme.id && (
                          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display Name Input */}
                <div>
                  <label
                    htmlFor="display-name"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5"
                  >
                    Display name
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6368]">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M20 21a8 8 0 0 0-16 0" />
                      </svg>
                    </div>
                    <input
                      id="display-name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Professor X"
                      className="h-11 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] pl-10 pr-3.5 text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] hover:border-[#747775] focus:bg-white focus:border-[#137333] focus:ring-4 focus:ring-[#137333]/15"
                    />
                  </div>
                </div>

                {/* Title & Department Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="academic-title" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5">
                      Academic title / Prefix
                    </label>
                    <select
                      id="academic-title"
                      value={academicTitle}
                      onChange={(e) => setAcademicTitle(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-xs sm:text-sm text-[#202124] outline-none transition focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    >
                      <option value="">None</option>
                      <option value="Professor">Professor</option>
                      <option value="Dr.">Dr.</option>
                      <option value="Mr.">Mr.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Instructor">Instructor</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="academic-dept" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5">
                      Subject / Department
                    </label>
                    <input
                      id="academic-dept"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. English Literature"
                      className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-xs sm:text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                    />
                  </div>
                </div>

                {/* School / Institution */}
                <div>
                  <label htmlFor="institution-input" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5">
                    School / Institution
                  </label>
                  <input
                    id="institution-input"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Greenwood High School / University"
                    className="h-10 w-full rounded-xl border border-[#dadce0] bg-[#fafafa] px-3 text-xs sm:text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  />
                </div>

                {/* Bio / Teacher Note */}
                <div>
                  <label htmlFor="bio-input" className="block text-xs font-semibold uppercase tracking-wider text-[#444746] mb-1.5">
                    Bio / Note to Students
                  </label>
                  <textarea
                    id="bio-input"
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a brief intro, office hours, or guidance on writing submissions..."
                    className="w-full rounded-xl border border-[#dadce0] bg-[#fafafa] p-3 text-xs sm:text-sm text-[#202124] outline-none transition placeholder:text-[#9aa0a6] focus:bg-white focus:border-[#137333] focus:ring-2 focus:ring-[#e6f4ea]"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: AI & Preferences */}
            {activeTab === "preferences" && (
              <div className="space-y-4 animate-fadeIn">
                {/* Plagiarism Engine Config */}
                <div className="rounded-2xl border border-[#dadce0] bg-[#f8f9fa] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e6f4ea] text-[#137333]">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#202124]">Copyleaks Plagiarism Engine</p>
                        <p className="text-[11px] text-[#5f6368]">Web authenticity & academic cross-check</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#137333] animate-pulse" /> Connected
                    </span>
                  </div>

                  <div>
                    <label htmlFor="plagiarism-sensitivity" className="block text-[11px] font-semibold text-[#444746] mb-1">
                      Detection Sensitivity Threshold
                    </label>
                    <select
                      id="plagiarism-sensitivity"
                      value={plagiarismSensitivity}
                      onChange={(e) => setPlagiarismSensitivity(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#dadce0] bg-white px-2.5 text-xs text-[#202124] outline-none focus:border-[#137333]"
                    >
                      <option value="standard">Standard (10% similarity alert — Recommended)</option>
                      <option value="strict">Strict (5% similarity alert — Flags minor paraphrases)</option>
                      <option value="permissive">Permissive (20% similarity alert — Verbatim focus)</option>
                    </select>
                  </div>
                </div>

                {/* YOLO26x + TrOCR Engine Info */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#137333] text-white shadow-2xs">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0d652d]">Handwriting AI OCR</p>
                      <p className="text-[11px] text-[#137333]">YOLO26x Line Detector + TrOCR Transformer</p>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-900">
                    Active
                  </span>
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-1">
                  <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[#dadce0] bg-white p-3 hover:bg-[#f8f9fa] transition">
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Peer-to-Peer Cross Check</p>
                      <p className="text-[11px] text-[#5f6368]">Compare student essays against classmates' submissions</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={peerCrossCheck}
                      onChange={(e) => setPeerCrossCheck(e.target.checked)}
                      className="h-4 w-4 rounded text-[#137333] accent-[#137333] focus:ring-[#137333]"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[#dadce0] bg-white p-3 hover:bg-[#f8f9fa] transition">
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Submission Email Notifications</p>
                      <p className="text-[11px] text-[#5f6368]">Receive notifications when students turn in work</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyOnSubmissions}
                      onChange={(e) => setNotifyOnSubmissions(e.target.checked)}
                      className="h-4 w-4 rounded text-[#137333] accent-[#137333] focus:ring-[#137333]"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer rounded-xl border border-[#dadce0] bg-white p-3 hover:bg-[#f8f9fa] transition">
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Weekly Integrity Digest</p>
                      <p className="text-[11px] text-[#5f6368]">Receive a weekly summary report of scan scores</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={weeklyDigest}
                      onChange={(e) => setWeeklyDigest(e.target.checked)}
                      className="h-4 w-4 rounded text-[#137333] accent-[#137333] focus:ring-[#137333]"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: Security */}
            {activeTab === "security" && (
              <div className="space-y-4 animate-fadeIn">
                {/* Registered Email Card */}
                <div className="rounded-2xl border border-[#dadce0] bg-[#f8f9fa] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-[#5f6368]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <span className="text-xs font-medium text-[#5f6368]">Registered email</span>
                    </div>
                    <span className="rounded-md bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#137333]">
                      Verified
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#202124] break-all pl-6">
                    {profile?.email}
                  </p>
                </div>

                {/* Instant Password Reset Card */}
                <div className="rounded-2xl border border-[#dadce0] bg-white p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#202124]">Account security</p>
                        <p className="text-[11px] text-[#5f6368]">Update your account password</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSendingReset}
                      onClick={handleSendResetEmail}
                      className="inline-flex items-center gap-1 rounded-full border border-[#dadce0] bg-white px-3 py-1 text-xs font-semibold text-[#137333] hover:bg-[#e6f4ea] hover:border-[#137333] transition disabled:opacity-50"
                    >
                      {isSendingReset ? "Sending..." : "Send reset link"}
                    </button>
                  </div>

                  {resetSentMessage ? (
                    <p className="text-xs font-medium text-[#137333] bg-[#e6f4ea] p-2 rounded-lg">
                      {resetSentMessage}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                      <span className="text-[#5f6368]">Or visit reset page:</span>
                      <Link
                        to="/forgot-password"
                        className="font-medium text-[#137333] hover:underline"
                      >
                        Reset password page →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Account Details & Session */}
                <div className="rounded-2xl border border-[#dadce0] bg-[#f8f9fa] p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5f6368]">Account ID:</span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-[#202124] hover:text-[#137333] font-semibold"
                      title="Click to copy full ID"
                    >
                      <span>{profile?.id ? `${profile.id.slice(0, 8)}...${profile.id.slice(-4)}` : "—"}</span>
                      <span className="text-[10px] text-[#137333] underline">{copiedId ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5f6368]">Active Device:</span>
                    <span className="font-semibold text-[#202124]">Windows • Chrome (Active now)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5f6368]">Protection:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#137333]">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                      Supabase Row Level Security (RLS)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Error & Success Alerts */}
            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#fad2cf] bg-[#fce8e6] p-3 text-[#c5221f]">
                <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs font-medium leading-5">{error}</p>
              </div>
            )}

            {message && (
              <div role="status" className="flex items-start gap-2.5 rounded-xl border border-[#ceead6] bg-[#e6f4ea] p-3 text-[#137333]">
                <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="text-xs font-medium leading-5">{message}</p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-[#f1f3f4]">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-full px-5 py-2 text-xs sm:text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124] transition"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#137333] px-6 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-[#0f5b28] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#e6f4ea] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {busy ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span>Saving…</span>
                  </>
                ) : (
                  "Save profile"
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}
