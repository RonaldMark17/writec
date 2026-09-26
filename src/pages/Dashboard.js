import { useEffect, useState, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, signOutAndExpireToken } from "../supabaseClient";
import { apiFetch, getBackendUrl } from "../apiFetch";
import StudentDashboard from "./StudentDashboard";
import TeacherDashboard from "./TeacherDashboard";
import AdminDashboard from "./AdminDashboard";
import { isCustomAvatarUrl, getAvatarPublicUrl } from "./dashboard/shared";

export default function Dashboard({ session: propSession, adminOnly = false }) {
  const location = useLocation();
  const user = propSession?.user;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tookLong, setTookLong] = useState(false);
  const userId = user?.id;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    let cancelled = false;

    // Only show loading spinner on initial mount when there is no profile yet
    if (!profileRef.current) {
      setLoading(true);
    }

    const slowTimer = setTimeout(() => {
      if (!cancelled) setTookLong(true);
    }, 4000);

    async function load() {
      try {
        if (!userId) throw new Error("Sign in to continue.");

        let data = null;

        // 1. Try authoritative RPC current_account with a timeout so it never hangs
        try {
          const rpcPromise = supabase.rpc("current_account");
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC_TIMEOUT")), 5000)
          );
          const response = await Promise.race([rpcPromise, timeoutPromise]);
          if (response && !response.error && response.data) {
            data = response.data;
          }
        } catch (rpcErr) {
          // RPC failed or timed out; will fall back
        }

        // 2. If current_account RPC did not return data, fall back to direct userTable query
        if (!data && typeof supabase?.from === "function") {
          try {
            const { data: rowData, error: tableErr } = await supabase
              .from("userTable")
              .select("id, full_name, email, role, account_status, registered_at")
              .eq("id", userId)
              .maybeSingle();

            if (!tableErr && rowData) {
              data = rowData;
            }
          } catch (tErr) {}
        }

        // 3. If profile still doesn't exist in userTable, try to insert default profile
        if (!data && typeof supabase?.from === "function") {
          const role = user?.user_metadata?.role === "teacher" ? "teacher" : "student";
          try {
            const { error: createError } = await supabase.from("userTable").insert({
              id: userId,
              full_name: user?.user_metadata?.full_name || user?.email,
              email: user?.email,
              role,
              account_status: "active",
            });
            if (!createError || createError.code === "23505") {
              const { data: createdRow } = await supabase
                .from("userTable")
                .select("id, full_name, email, role, account_status, registered_at")
                .eq("id", userId)
                .maybeSingle();
              if (createdRow) data = createdRow;
            }
          } catch (cErr) {}
        }

        // 4. Fallback to session metadata if table query was unavailable
        if (!data && user) {
          const metaRole = user?.user_metadata?.role === "teacher" ? "teacher" : "student";
          data = {
            id: userId,
            full_name: user?.user_metadata?.full_name || user?.email,
            email: user?.email,
            role: metaRole,
            account_status: "active",
            registered_at: user?.created_at || null,
          };
        }

        if (!data || !["student", "teacher", "admin"].includes(data.role)) {
          throw new Error("Your account has no valid workspace role. Contact an administrator.");
        }

        if (!cancelled) {
          let localPrefs = {};
          if (data?.id && typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem(`writecheck_profile_prefs_${data.id}`);
              if (stored) localPrefs = JSON.parse(stored);
            } catch {}
          }
          const metaAvatar = isCustomAvatarUrl(user?.user_metadata?.avatar_url) ? user.user_metadata.avatar_url : "";
          const metaColor = user?.user_metadata?.avatar_color || "";
          const customLocalAvatar = isCustomAvatarUrl(localPrefs?.avatarUrl) ? localPrefs.avatarUrl : "";
          const publicStorageAvatar = data?.id ? getAvatarPublicUrl(data.id) : "";
          const finalAvatarUrl = customLocalAvatar || metaAvatar || publicStorageAvatar;

          // If user has a local base64 avatar, automatically sync it to public storage once
          if (customLocalAvatar && customLocalAvatar.startsWith("data:") && data?.id) {
            const backendUrl = getBackendUrl();
            apiFetch(`${backendUrl}/api/users/${data.id}/avatar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ avatar_data: customLocalAvatar }),
            })
              .then((r) => r.json())
              .then((res) => {
                if (res?.avatar_url) {
                  try {
                    const current = JSON.parse(localStorage.getItem(`writecheck_profile_prefs_${data.id}`) || "{}");
                    current.avatarUrl = res.avatar_url;
                    localStorage.setItem(`writecheck_profile_prefs_${data.id}`, JSON.stringify(current));
                  } catch {}
                }
              })
              .catch(() => {});
          }

          setProfile((prev) => ({
            ...(prev || {}),
            avatarUrl: finalAvatarUrl,
            avatarColor: metaColor,
            ...data,
            ...localPrefs,
            avatarUrl: finalAvatarUrl,
          }));
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          if (!profileRef.current) {
            setError(err.message || "Unable to verify your account.");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearInterval(timer);
    };
  }, [userId, retry]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <div>
            <h2 className="text-base font-semibold text-[#202124]">Loading workspace...</h2>
            <p className="mt-1 text-xs text-[#5f6368]">Preparing your dashboard and classrooms</p>
          </div>
          {tookLong && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <p className="text-xs text-amber-700">Connecting is taking longer than usual.</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setTookLong(false);
                    setRetry((r) => r + 1);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Retry Connection
                </button>
                <button
                  type="button"
                  onClick={() => signOutAndExpireToken("/login")}
                  className="rounded-md bg-[#137333] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#0d5925]"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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

