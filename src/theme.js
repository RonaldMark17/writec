import { useSyncExternalStore } from "react";

const KEY = "writecheck-theme";
const EVENT = "writecheck-theme-change";
let temporaryTheme = null;

function savedTheme() {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function currentTheme() {
  const saved = savedTheme() || temporaryTheme;
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme() {
  const theme = currentTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  return theme;
}

export function setTheme(theme) {
  try { window.localStorage.setItem(KEY, theme); temporaryTheme = null; } catch { temporaryTheme = theme; }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const update = () => { applyTheme(); callback(); };
  const changed = () => callback();
  window.addEventListener("storage", update);
  window.addEventListener(EVENT, changed);
  media?.addEventListener?.("change", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(EVENT, changed);
    media?.removeEventListener?.("change", update);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe,
    () => document.documentElement.dataset.theme || currentTheme(), () => "light");
  return { isDark: theme === "dark", toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") };
}
