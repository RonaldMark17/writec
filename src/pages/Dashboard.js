import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, signOutAndExpireToken } from "../supabaseClient";
import { accountRequest } from "../accountRequest";
import { profilePreferences } from "../profilePreferences";
import StudentDashboard from "./StudentDashboard";
import TeacherDashboard from "./TeacherDashboard";
import AdminDashboard from "./AdminDashboard";

export default function Dashboard({ session: propSession, adminOnly = false }) {
  const location = useLocation();
  const user = propSession?.user;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;
    let running = false;

    // Only show loading spinner on initial mount when there is no profile yet
    setProfile((prev) => {
      if (!prev) setLoading(true);
      return prev;
    });

    async function load() {
      if (running) return;
      running = true;
      try {
        if (!userId) throw new Error("Sign in to continue.");
        let { data, error: profileError } = await accountRequest((signal) => supabase.rpc("current_account").abortSignal(signal));
        if (profileError) throw profileError;
        if (!data) {
          // Metadata is only a registration hint; it can never grant admin access.
          const role = user?.user_metadata?.role === "teacher" ? "teacher" : "student";
          const { error: createError } = await accountRequest((signal) => supabase.from("userTable").insert({
            id: userId,
            full_name: user?.user_metadata?.full_name || user?.email,
            email: user?.email,
            role,
          }).abortSignal(signal));
          if (createError && createError.code !== "23505") throw createError;
          const response = await accountRequest((signal) => supabase.rpc("current_account").abortSignal(signal));
          if (response.error) throw response.error;
          data = response.data;
        }
        if (!data || !["student", "teacher", "admin"].includes(data.role)) {
          throw new Error("Your account has no valid workspace role. Contact an administrator.");
        }
        const { data: authData, error: authError } = await accountRequest(() => supabase.auth.getUser());
        if (authError) throw authError;
        const metadata = authData?.user?.user_metadata || {};
        if (!cancelled) {
          let localPrefs = {};
          if (data?.id && typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem(`writecheck_profile_prefs_${data.id}`);
              if (stored) localPrefs = JSON.parse(stored);
            } catch {}
          }
          const metaAvatar = metadata.avatar_url || "";
          const metaColor = metadata.avatar_color || "";
          setProfile((prev) => ({
            ...(prev || {}),
            avatarUrl: metaAvatar,
            avatarColor: metaColor,
            ...data,
            ...profilePreferences(metadata.writecheck_preferences ?? localPrefs),
          }));
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setProfile((prev) => {
            // Only clear profile if we did not already have one
            if (!prev) setError(err.message || "Unable to verify your account.");
            return prev;
          });
        }
      } finally {
        running = false;
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, retry]);

  if (loading) return <div role="status" className="p-12 text-center">Verifying your account…</div>;
  if (error || !profile || profile.account_status !== "active") return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center">
        <h1 className="text-xl font-bold">Workspace unavailable</h1>
        <p role="alert" className="mt-4 text-sm text-red-700">{error || "This account is inactive. Contact an administrator to reactivate it."}</p>
        <button onClick={() => setRetry(retry + 1)} className="m-3 text-emerald-700 underline">Retry</button>
        <button onClick={() => signOutAndExpireToken("/login")} className="m-3 text-emerald-700 underline">Sign out</button>
      </div>
    </main>
  );
  if (adminOnly && profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  if (profile.role === "admin") return adminOnly ? <AdminDashboard key={location.pathname} profile={profile} onProfileUpdated={setProfile} /> : <Navigate to="/admin/dashboard" replace />;
  if (profile.role === "student") return <StudentDashboard profile={profile} onProfileUpdated={setProfile} />;
  return <TeacherDashboard profile={profile} onProfileUpdated={setProfile} />;
}
