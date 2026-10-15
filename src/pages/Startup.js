import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthModal from "./AuthModal";
import { useTheme } from "../theme";

import LandingDemo from "./LandingDemo";
import "./landing.css";

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





const stats = [
  ["From paper to text", "Handwritten essays, ready for review"],
  ["Context for educators", "Matching passages inform your judgment"],
];

const features = [
  {
    title: "Organized classrooms",
    copy:
      "Every assignment is strictly bound to its section. Submissions, files, and grades never cross between classes.",
    icon: ClassroomHatIcon,
  },
  {
    title: "Smart Handwriting OCR",
    copy:
      "Transcribes handwritten student essay scans and photographs into searchable text using advanced OCR models.",
    icon: LayersIcon,
  },
  {
    title: "Similarity Analysis",
    copy:
      "Reviews essay text for matching content and presents similarity results and sources for instructor review.",
    icon: SearchIcon,
  },
  {
    title: "Classroom Peer Similarity",
    copy:
      "Helps instructors identify matching passages between submissions within the same classroom.",
    icon: FileIcon,
  },
];

export default function Startup({ initialAuthModal = null }) {
  const navigate = useNavigate();
  const [authModal, setAuthModal] = useState(initialAuthModal);
  const { isDark, toggleTheme } = useTheme();
  const [activeSection, setActiveSection] = useState("home");
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
    const ids = ["home", "demo", "about", "features"];
    if (!window.IntersectionObserver) return undefined;
    let observer;
    const update = () => {
      const current = window.scrollY < 80 ? "home" : ids.reduce((selected, id) => {
        const node = document.getElementById(id);
        return node && node.getBoundingClientRect().top <= 230 ? id : selected;
      }, "home");
      setActiveSection(current);
      if (window.location.hash !== `#${current}`) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${current}`);
      }
    };
    const observe = () => {
      observer?.disconnect();
      // Pixel margins avoid percentage root margins being based on viewport width.
      observer = new IntersectionObserver(update, {
        rootMargin: `-120px 0px -${Math.max(0, window.innerHeight - 230)}px 0px`, threshold: 0,
      });
      ids.forEach(id => { const node = document.getElementById(id); if (node) observer.observe(node); });
      update();
    };
    observe();
    window.addEventListener("resize", observe);
    return () => { observer.disconnect(); window.removeEventListener("resize", observe); };
  }, []);

  const getNavLinkClass = (sectionId) =>
    activeSection === sectionId
      ? "text-[var(--accent)] font-semibold bg-[var(--accent-soft)] px-3.5 py-1.5 rounded-full transition"
      : "text-[var(--muted)] font-medium hover:text-[var(--page-text)] hover:bg-[var(--border-soft)] px-3.5 py-1.5 rounded-full transition";

  return (
    <div
      className="landing-page min-h-screen bg-[var(--page-bg)] text-[var(--page-text)] antialiased transition-colors duration-200"
      style={isDark ? undefined : lightTheme}
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

            <nav aria-label="Main navigation" className="landing-desktop-nav hidden md:flex items-center gap-1 pl-4 border-l border-[var(--border)] text-sm">
              <a href="#home" aria-current={activeSection === "home" ? "location" : undefined} className={getNavLinkClass("home")}>
                Home
              </a>
              <a href="#about" aria-current={activeSection === "about" ? "location" : undefined} className={getNavLinkClass("about")}>
                About
              </a>
              <a href="#features" aria-current={activeSection === "features" ? "location" : undefined} className={getNavLinkClass("features")}>
                Features
              </a>
              <a href="#demo" aria-current={activeSection === "demo" ? "location" : undefined} className={getNavLinkClass("demo")}>How it works</a>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
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
              className="landing-nav-register inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] px-5 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)] transition"
            >
              Get started
            </button>
          </div>
        </div>
        <nav aria-label="Mobile navigation" className="landing-mobile-nav">
          {[['home', 'Home'], ['demo', 'How it works'], ['about', 'About'], ['features', 'Features']].map(([id, label]) =>
            <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} className={getNavLinkClass(id)}>{label}</a>)}
        </nav>
      </header>

      {/* Hero Section */}
      <main className="mx-auto w-full max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        <section
          id="home"
          className="grid items-start gap-12 lg:grid-cols-12 lg:gap-8 xl:gap-12"
        >
          {/* Left Column: Heading & Google Classroom Intro */}
          <div className="lg:col-span-6 xl:col-span-6 pt-2">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--page-text)] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.15]">
              Handwritten essays. Clearer review.
            </h1>

            <p className="mt-6 text-base sm:text-lg leading-relaxed text-[var(--muted)] max-w-xl">
              Turn handwritten essays into readable text and review matching passages. A focused classroom workflow for teachers and students, from submission to feedback.
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
                href="#demo"
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

          <div id="demo" className="lg:col-span-6 xl:col-span-6 min-w-0">
            <LandingDemo onAuth={handleOpenAuthModal} />
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
            className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-2 scroll-mt-24"
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
              Bring handwritten essays into your classroom workflow.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[var(--muted)] max-w-xl mx-auto">
              Create a classroom, collect essay submissions, and review similarity evidence with the context it deserves.
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
            <span>— Thoughtful review. Original thinking.</span>
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
              href="/contact"
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
