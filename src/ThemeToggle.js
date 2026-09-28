import { useTheme } from "./theme";
import { useLocation } from "react-router-dom";

export default function ThemeToggle({ inline = false }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button type="button" className={inline ? "inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" : "workspace-theme-toggle"} onClick={toggleTheme}
      aria-label={isDark ? "Switch workspace to light mode" : "Switch workspace to dark mode"}
      aria-pressed={isDark} title={isDark ? "Use light mode" : "Use dark mode"}>
      <svg className="shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {isDark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />}
      </svg>
      <span className={inline ? "hidden sm:inline" : undefined}>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export function GlobalThemeToggle() {
  const { pathname } = useLocation();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? null : <ThemeToggle />;
}
