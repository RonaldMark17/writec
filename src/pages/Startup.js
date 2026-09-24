import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthModal from "./AuthModal";

import {
  ACCEPTED_CHECK_FILE_TYPES,
  analyzePlagiarismInput,
  formatFileSize,
  getFileKind,
  readTextFromFiles,
} from "./dashboard/plagiarismScan";

function UploadIcon({ className = "h-5 w-5" }) {
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

function ImageIcon({ className = "h-5 w-5" }) {
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

function LayoutIcon({ className = "h-5 w-5" }) {
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
      <rect width="16" height="14" x="4" y="5" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 10v9" />
    </svg>
  );
}

function LayersIcon({ className = "h-5 w-5" }) {
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
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }) {
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
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FileIcon({ className = "h-5 w-5" }) {
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

function ClipboardIcon({ className = "h-5 w-5" }) {
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

function MoonIcon({ className = "h-5 w-5" }) {
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
      <path d="M12 3a6 6 0 0 0 9 7.8A9 9 0 1 1 12 3Z" />
    </svg>
  );
}

function SunIcon({ className = "h-5 w-5" }) {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function ClassroomHatIcon({ className = "h-5 w-5" }) {
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
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function CheckShieldIcon({ className = "h-5 w-5" }) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const lightTheme = {
  "--page-bg": "#ffffff",
  "--page-text": "#202124",
  "--muted": "#5f6368",
  "--accent": "#137333",
  "--accent-hover": "#0d652d",
  "--accent-soft": "#e6f4ea",
  "--accent-border": "#ceead6",
  "--panel": "#ffffff",
  "--panel-soft": "#f8f9fa",
  "--border": "#dadce0",
  "--border-soft": "#f1f3f4",
  "--line": "#e8eaed",
  "--nav-bg": "rgba(255, 255, 255, 0.96)",
  "--shadow": "0 1px 3px 0 rgba(60, 64, 67, 0.08), 0 4px 8px 3px rgba(60, 64, 67, 0.04)",
  "--card-shadow": "0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)",
};

const darkTheme = {
  "--page-bg": "#202124",
  "--page-text": "#e8eaed",
  "--muted": "#9aa0a6",
  "--accent": "#81c995",
  "--accent-hover": "#a8dab5",
  "--accent-soft": "rgba(129, 201, 149, 0.15)",
  "--accent-border": "rgba(129, 201, 149, 0.3)",
  "--panel": "#292a2d",
  "--panel-soft": "#303134",
  "--border": "#3c4043",
  "--border-soft": "#35363a",
  "--line": "#3c4043",
  "--nav-bg": "rgba(32, 33, 36, 0.96)",
  "--shadow": "0 4px 14px rgba(0, 0, 0, 0.35)",
  "--card-shadow": "0 2px 6px rgba(0, 0, 0, 0.4)",
};

function getInitialDarkMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const savedTheme = window.localStorage.getItem("writecheck-theme");

  if (savedTheme) {
    return savedTheme === "dark";
  }

  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

const stats = [
  ["YOLO26x + TrOCR", "Handwriting OCR engine"],
  ["Copyleaks API", "Web & peer plagiarism scan"],
];

const steps = [
  { step: "1", title: "Intake", desc: "Photo, Doc, or Paste" },
  { step: "2", title: "Detect", desc: "Text region segmentation" },
  { step: "3", title: "Transcribe", desc: "Handwriting OCR" },
  { step: "4", title: "Verify", desc: "Copyleaks similarity" },
];

const demoModes = [
  {
    id: "picture",
    label: "Picture",
    icon: ImageIcon,
  },
  {
    id: "file",
    label: "Document",
    icon: FileIcon,
  },
  {
    id: "text",
    label: "Paste Text",
    icon: ClipboardIcon,
  },
];

const features = [
  {
    title: "Classroom Section Isolation",
    copy:
      "Every assignment is strictly bound to its section. Submissions, files, and grades never cross between classes.",
    icon: ClassroomHatIcon,
  },
  {
    title: "Handwriting OCR & Vision",
    copy:
      "Transcribes handwritten student essay scans and photographs into searchable text using advanced OCR models.",
    icon: LayersIcon,
  },
  {
    title: "Copyleaks Plagiarism Engine",
    copy:
      "Checks student submissions against billions of web pages, published academic papers, and local peer submissions.",
    icon: SearchIcon,
  },
  {
    title: "Official PDF Audit Reports",
    copy:
      "Export grade-ready plagiarism summary cards with matched excerpts, similarity percentages, and student timestamps.",
    icon: FileIcon,
  },
];

export default function Startup({ initialAuthModal = null }) {
  const navigate = useNavigate();
  const [authModal, setAuthModal] = useState(initialAuthModal);
  const [isDark, setIsDark] = useState(getInitialDarkMode);
  const [activeSection, setActiveSection] = useState("home");
  const [demoMode, setDemoMode] = useState("picture");
  const [demoFiles, setDemoFiles] = useState([]);
  const [demoText, setDemoText] = useState("");
  const [demoPreview, setDemoPreview] = useState("");
  const [demoResult, setDemoResult] = useState(null);
  const [demoError, setDemoError] = useState("");
  const [isDemoScanning, setIsDemoScanning] = useState(false);

  useEffect(() => {
    setAuthModal(initialAuthModal);
  }, [initialAuthModal]);

  const handleCloseAuthModal = () => {
    setAuthModal(null);
    if (window.location.pathname === "/login" || window.location.pathname === "/register") {
      navigate("/", { replace: true });
    }
  };

  const handleOpenAuthModal = (mode) => {
    setAuthModal(mode);
  };

  useEffect(() => {
    window.localStorage.setItem("writecheck-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const updateActiveSection = () => {
      const sectionIds = ["home", "about", "features"];
      const scrollMarker = window.scrollY + 160;

      const currentSection = sectionIds.reduce((current, sectionId) => {
        const section = document.getElementById(sectionId);

        if (!section) {
          return current;
        }

        return section.offsetTop <= scrollMarker ? sectionId : current;
      }, "home");

      setActiveSection(currentSection);
    };

    updateActiveSection();

    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("hashchange", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, []);

  useEffect(() => {
    const imageFile = demoFiles.find((file) => file.type?.startsWith("image/"));

    if (!imageFile) {
      setDemoPreview("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setDemoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [demoFiles]);

  const handleDemoFiles = (event) => {
    const nextFiles = Array.from(event.target.files ?? []);

    setDemoFiles(nextFiles);
    setDemoResult(null);
    setDemoError("");

    if (nextFiles.length > 0 && demoMode === "text") {
      setDemoMode("file");
    }
  };

  const handleDemoScan = async (event) => {
    event.preventDefault();
    setDemoError("");
    setDemoResult(null);

    if (!demoText.trim() && demoFiles.length === 0) {
      setDemoError("Select an essay picture, upload a file, or paste text to scan.");
      return;
    }

    setIsDemoScanning(true);

    try {
      const fileText = await readTextFromFiles(demoFiles);

      const combinedText = [demoText, fileText.text]
        .map((value) => value.trim())
        .filter(Boolean)
        .join("\n\n");

      setDemoResult({
        ...analyzePlagiarismInput({
          text: combinedText,
          files: demoFiles,
        }),
        extractedText: fileText.extractedText,
        extractedImages: fileText.extractedImages,
        readableFiles: fileText.readableFiles,
        unreadableFiles: fileText.unreadableFiles,
      });
    } catch (error) {
      setDemoError(error.message || "Could not scan the selected material.");
    } finally {
      setIsDemoScanning(false);
    }
  };

  const handleUseSampleText = () => {
    setDemoMode("text");
    setDemoText(
      "Climate change impacts agricultural yields through erratic precipitation and elevated temperatures. Peer-reviewed research confirms that sustainable irrigation practices and soil biodiversity reduce vulnerability across diverse microclimates."
    );
    setDemoResult(null);
    setDemoError("");
  };

  const getNavLinkClass = (sectionId) =>
    activeSection === sectionId
      ? "text-[var(--accent)] font-semibold bg-[var(--accent-soft)] px-3.5 py-1.5 rounded-full transition"
      : "text-[var(--muted)] font-medium hover:text-[var(--page-text)] hover:bg-[var(--border-soft)] px-3.5 py-1.5 rounded-full transition";

  const demoResultBadgeClass =
    demoResult?.tone === "red"
      ? "bg-red-50 text-red-700 border border-red-200"
      : demoResult?.tone === "amber"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : "bg-emerald-50 text-emerald-700 border border-emerald-200";

  return (
    <div
      className="min-h-screen bg-[var(--page-bg)] text-[var(--page-text)] antialiased transition-colors duration-200"
      style={isDark ? darkTheme : lightTheme}
    >
      {/* Google Classroom styled Top Navigation */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-[var(--border)] bg-[var(--nav-bg)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <a
              href="#home"
              className="flex items-center gap-2.5 group"
              aria-label="WriteCheck Classroom Home"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white shadow-sm transition-transform group-hover:scale-105">
                <ClassroomHatIcon className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight text-[var(--page-text)]">
                  WriteCheck
                </span>
                <span className="text-[10px] font-medium text-[var(--accent)] tracking-wider uppercase -mt-1">
                  Classroom
                </span>
              </div>
            </a>

            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-[var(--border)] text-sm">
              <a href="#home" className={getNavLinkClass("home")}>
                Home
              </a>
              <a href="#about" className={getNavLinkClass("about")}>
                About
              </a>
              <a href="#features" className={getNavLinkClass("features")}>
                Features
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsDark((current) => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--border-soft)] hover:text-[var(--page-text)] transition"
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={isDark}
            >
              {isDark ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleOpenAuthModal("login")}
              className="inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] transition"
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={() => handleOpenAuthModal("register")}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)] transition"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto w-full max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        <section
          id="home"
          className="grid items-start gap-12 lg:grid-cols-12 lg:gap-8 xl:gap-12"
        >
          {/* Left Column: Heading & Google Classroom Intro */}
          <div className="lg:col-span-6 xl:col-span-6 pt-2">
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--page-text)] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.15]">
              Detect plagiarism in handwritten essays
            </h1>

            <p className="mt-6 text-base sm:text-lg leading-relaxed text-[var(--muted)] max-w-xl">
              Upload essay photos, review document files, or paste copied text directly into your classroom review station. Purpose-built for educators checking handwritten drafts alongside digital submissions.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenAuthModal("register")}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 transition"
              >
                Get started free
              </button>

              <a
                href="#about"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-transparent px-6 text-sm font-medium text-[var(--page-text)] hover:bg-[var(--panel-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              >
                See how it works
              </a>
            </div>

            {/* Metrics strip */}
            <div className="mt-12 grid max-w-md grid-cols-2 gap-6 border-t border-[var(--border)] pt-8">
              {stats.map(([title, desc]) => (
                <div key={title} className="pr-2">
                  <div className="text-base sm:text-lg font-semibold text-[var(--page-text)]">
                    {title}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)] font-normal leading-normal">
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Google Classroom Originality Station Card */}
          <div className="lg:col-span-6 xl:col-span-6">
            <form
              onSubmit={handleDemoScan}
              className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-sm overflow-hidden"
            >
              {/* Classroom header strip */}
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-soft)] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <CheckShieldIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[var(--page-text)]">
                      Classroom Review Station
                    </span>
                    <span className="hidden sm:inline-block ml-2 text-xs text-[var(--muted)]">
                      • Live submission check
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
                  Interactive Demo
                </span>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {/* Segmented Mode Selector */}
                <div className="flex rounded-lg bg-[var(--panel-soft)] p-1 border border-[var(--border-soft)]">
                  {demoModes.map(({ id, label, icon: Icon }) => {
                    const isActive = demoMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDemoMode(id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs sm:text-sm font-medium rounded-md transition ${
                          isActive
                            ? "bg-[var(--panel)] text-[var(--accent)] shadow-sm font-semibold"
                            : "text-[var(--muted)] hover:text-[var(--page-text)]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Upload or Drop Area */}
                {demoMode !== "text" && (
                  <label className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--panel-soft)] p-6 text-center hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/20 transition group">
                    {demoPreview ? (
                      <img
                        src={demoPreview}
                        alt="Essay upload preview"
                        className="max-h-[150px] w-full rounded-lg object-contain"
                      />
                    ) : (
                      <>
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition-transform group-hover:scale-105">
                          <UploadIcon className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-[var(--page-text)]">
                          Upload handwritten essay or document
                        </span>
                        <span className="mt-1 text-xs text-[var(--muted)]">
                          Images (PNG, JPG), PDF, or Word files
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept={
                        demoMode === "picture"
                          ? "image/png,image/jpeg,image/jpg,image/webp"
                          : ACCEPTED_CHECK_FILE_TYPES
                      }
                      multiple
                      onChange={handleDemoFiles}
                      className="sr-only"
                    />
                  </label>
                )}

                {demoFiles.length > 0 && (
                  <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden text-xs">
                    {demoFiles.slice(0, 2).map((file) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between px-3 py-2 bg-[var(--panel)]"
                      >
                        <span className="truncate font-medium text-[var(--page-text)] max-w-[220px]">
                          {file.name}
                        </span>
                        <span className="text-[var(--muted)]">
                          {getFileKind(file)} • {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pasted text textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="pasted-text"
                      className="text-xs font-medium text-[var(--muted)]"
                    >
                      Student Text / OCR Input
                    </label>
                    <button
                      type="button"
                      onClick={handleUseSampleText}
                      className="text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      Insert sample essay
                    </button>
                  </div>
                  <textarea
                    id="pasted-text"
                    value={demoText}
                    onChange={(event) => {
                      setDemoText(event.target.value);
                      setDemoResult(null);
                      if (event.target.value && demoMode !== "text") {
                        setDemoMode("text");
                      }
                    }}
                    rows={3}
                    placeholder="Paste essay paragraph or OCR transcript here..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--page-text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition"
                  />
                </div>

                {demoError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {demoError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isDemoScanning}
                    className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    <SearchIcon className="h-4 w-4" />
                    <span>{isDemoScanning ? "Analyzing..." : "Run Originality Check"}</span>
                  </button>
                </div>

                {/* Results or Workflow Steps */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                  {demoResult ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-bold text-[var(--page-text)]">
                            {demoResult.score}
                          </div>
                          <div className="text-xs uppercase tracking-wider text-[var(--muted)] font-medium">
                            Similarity Index
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${demoResultBadgeClass}`}
                        >
                          {demoResult.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--panel)] p-2.5 border border-[var(--border-soft)] text-center">
                        <div>
                          <div className="text-sm font-bold text-[var(--page-text)]">
                            {demoResult.wordCount}
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">Words</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[var(--page-text)]">
                            {demoResult.sourceSignals}
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">Sources</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[var(--page-text)]">
                            {demoResult.unreadableFiles.length === 0 ? "Ready" : "Flags"}
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">OCR Status</div>
                        </div>
                      </div>

                      <p className="text-xs text-[var(--muted)] leading-relaxed">
                        {demoResult.flags[0]}
                      </p>

                      {demoResult.extractedText && (
                        <div>
                          <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                            Extracted Transcript
                          </span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-xs font-mono text-[var(--page-text)] whitespace-pre-wrap">
                            {demoResult.extractedText}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3 text-center">
                        Classroom Verification Pipeline
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {steps.map(({ step, title, desc }) => (
                          <div key={step} className="flex flex-col items-center">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)] mb-1">
                              {step}
                            </div>
                            <span className="text-xs font-semibold text-[var(--page-text)]">
                              {title}
                            </span>
                            <span className="text-[10px] text-[var(--muted)] leading-tight mt-0.5">
                              {desc}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* Section 2: Built for Educators (About) */}
        <section
          id="about"
          className="mt-28 scroll-mt-24 border-t border-[var(--border)] pt-20"
        >
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-0.5 text-xs font-medium text-[var(--accent)] mb-4">
              Designed for Classroom Workflows
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--page-text)] sm:text-4xl">
              Built for educators checking original work
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[var(--muted)]">
              WriteCheck brings together handwritten student submissions, printed drafts, and digital papers into one streamlined teacher dashboard. Assignments and student submissions are automatically organized by classroom section.
            </p>
          </div>

          {/* Features Grid */}
          <div
            id="features"
            className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 scroll-mt-24"
          >
            {features.map(({ title, copy, icon: Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 transition-all hover:shadow-md hover:border-[var(--accent)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] mb-5">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-[var(--page-text)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Google Classroom Integration Banner */}
        <section className="mt-24 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-8 sm:p-12">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
              <ClassroomHatIcon className="h-6 w-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--page-text)]">
              Ready to verify student work with Google Classroom?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[var(--muted)] max-w-xl mx-auto">
              Join teachers and students already checking handwritten essays, upholding academic integrity, and reviewing clear submission reports.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenAuthModal("register")}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)] transition"
              >
                Create Teacher Account
              </button>
              <button
                type="button"
                onClick={() => handleOpenAuthModal("login")}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-6 text-sm font-medium text-[var(--page-text)] hover:bg-[var(--border-soft)] transition"
              >
                Student Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--panel)] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent)] text-white">
              <ClassroomHatIcon className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-[var(--page-text)]">WriteCheck</span>
            <span>— Google Classroom Inspired Academic Integrity</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#home" className="hover:text-[var(--page-text)] transition">
              Home
            </a>
            <a href="#about" className="hover:text-[var(--page-text)] transition">
              About
            </a>
            <a href="#features" className="hover:text-[var(--page-text)] transition">
              Features
            </a>
            <a
              href="mailto:support@writecheck.ai"
              className="hover:text-[var(--page-text)] transition"
            >
              Contact
            </a>
          </div>

          <div>
            &copy; {new Date().getFullYear()} WriteCheck AI. All rights reserved.
          </div>
        </div>
      </footer>

      {authModal && (
        <AuthModal
          initialMode={authModal}
          onClose={handleCloseAuthModal}
          onModeChange={(nextMode) => setAuthModal(nextMode)}
        />
      )}
    </div>
  );
}
