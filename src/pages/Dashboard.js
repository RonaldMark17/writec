import { useEffect, useState } from "react";

import {
  supabase,
  isSessionExpired,
  signOutAndExpireToken,
} from "../supabaseClient";
import StudentDashboard from "./StudentDashboard";
import TeacherDashboard from "./TeacherDashboard";

export default function Dashboard({ session: propSession }) {
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchUserProfile = async (user) => {
      if (!user) {
        if (isMounted) {
          setProfile(null);
          setIsProfileLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("userTable")
        .select("full_name, email, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      const fallbackProfile = {
        id: user.id,
        email: user.email,
        full_name:
          user.user_metadata?.full_name ||
          user.email,
        role:
          user.user_metadata?.role ||
          "teacher",
      };

      let profileRow = data;

      if (!profileRow) {
        const { data: createdProfile } = await supabase
          .from("userTable")
          .upsert([
            {
              id: fallbackProfile.id,
              full_name: fallbackProfile.full_name,
              email: fallbackProfile.email,
              role: fallbackProfile.role,
            },
          ])
          .select("full_name, email, role")
          .maybeSingle();

        profileRow = createdProfile ?? fallbackProfile;
      }

      if (!isMounted) return;

      setProfile({
        id: user.id,
        email: profileRow?.email || user.email,
        full_name:
          profileRow?.full_name ||
          user.user_metadata?.full_name ||
          user.email,
        role:
          profileRow?.role ||
          user.user_metadata?.role ||
          "teacher",
      });
      setIsProfileLoading(false);
    };

    const loadProfile = async () => {
      // 1. If propSession is passed, check expiry first
      if (propSession) {
        if (isSessionExpired(propSession)) {
          await signOutAndExpireToken("/login");
          return;
        }
        if (propSession.user) {
          await fetchUserProfile(propSession.user);
          return;
        }
      }

      // 2. Try current local session and check expiry
      const { data: sessionData } = await supabase.auth.getSession();
      const localSession = sessionData?.session;
      if (localSession) {
        if (isSessionExpired(localSession)) {
          await signOutAndExpireToken("/login");
          return;
        }
        if (localSession.user) {
          await fetchUserProfile(localSession.user);
          return;
        }
      }

      // 3. Fall back to getUser network call
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await fetchUserProfile(userData.user);
      } else {
        if (isMounted) {
          setProfile(null);
          setIsProfileLoading(false);
        }
      }
    };

    loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      if (session) {
        if (isSessionExpired(session)) {
          await signOutAndExpireToken("/login");
          return;
        }
        if (session.user) {
          await fetchUserProfile(session.user);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, [propSession]);

  if (isProfileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-6 text-center text-[#202124]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <span className="text-sm font-medium text-[#5f6368]">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-6 text-center text-[#202124]">
        <div>
          <p className="text-sm font-medium text-red-600">Session expired or not found</p>
          <a
            href="/login"
            className="mt-3 inline-block rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white hover:bg-[#0f5b28]"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (profile.role === "student") {
    return <StudentDashboard profile={profile} />;
  }

  return <TeacherDashboard profile={profile} />;
}
