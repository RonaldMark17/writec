import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qtqvnutcalmmqmmbwueu.supabase.co";
const supabaseAnonKey = "sb_publishable_wNxWHuOyc0riOo4VXmsbGQ_jxPZi03s";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

/**
 * Checks if a Supabase auth session has reached its expiration time.
 * @param {object|null} session
 * @returns {boolean}
 */
export function isSessionExpired(session) {
  if (!session) return true;
  if (!session.expires_at) return false;
  // session.expires_at is unix timestamp in seconds
  return (Date.now() / 1000) >= session.expires_at;
}

/**
 * Fully signs out the user, revokes session on the server globally,
 * and purges all cached authentication tokens from browser storage.
 */
export async function signOutAndExpireToken(redirectPath = "/login") {
  try {
    // 1. Invalidate session globally on the Supabase auth server
    await supabase.auth.signOut({ scope: "global" });
  } catch (err) {
    console.warn("Supabase global signout notice:", err);
  }

  // 2. Explicitly scrub all auth tokens from localStorage and sessionStorage
  try {
    if (typeof window !== "undefined") {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (
          key &&
          (key.startsWith("sb-") ||
            key.includes("supabase") ||
            key.includes("auth-token"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      window.sessionStorage.clear();
    }
  } catch (err) {
    console.warn("Storage scrub notice:", err);
  }

  // 3. Redirect to login page
  if (typeof window !== "undefined") {
    window.location.href = redirectPath;
  }
}