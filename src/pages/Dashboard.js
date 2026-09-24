import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, signOutAndExpireToken } from "../supabaseClient";
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
  useEffect(() => {
    let cancelled = false;
    let running = false;
    setLoading(true);
    setProfile(null);
    async function load() {
      if (running) return;
      running = true;
      try {
        if (!user) throw new Error("Sign in to continue.");
        let { data, error: profileError } = await supabase.rpc("current_account");
        if (profileError) throw profileError;
        if (!data) {
          // Metadata is only a registration hint; it can never grant admin access.
          const role = user.user_metadata?.role === "teacher" ? "teacher" : "student";
          const { error: createError } = await supabase.from("userTable").insert({
            id: user.id, full_name: user.user_metadata?.full_name || user.email,
            email: user.email, role,
          });
          if (createError && createError.code !== "23505") throw createError;
          const response = await supabase.rpc("current_account");
          if (response.error) throw response.error;
          data = response.data;
        }
        if (!data || !["student", "teacher", "admin"].includes(data.role)) throw new Error("Your account has no valid workspace role. Contact an administrator.");
        if (!cancelled) { setProfile(data); setError(""); }
      } catch (err) {
        if (!cancelled) { setProfile(null); setError(err.message || "Unable to verify your account."); }
      } finally { running = false; if (!cancelled) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [user, retry]);

  if (loading) return <div className="p-12 text-center">Loading workspace?</div>;
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
