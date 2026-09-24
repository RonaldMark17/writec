import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { useEffect, useState } from "react";

import {
  supabase,
  isSessionExpired,
  signOutAndExpireToken,
} from "./supabaseClient";

import PasswordReset from "./pages/PasswordReset";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Startup from "./pages/Startup";

function ProtectedDashboard({ session, isAuthLoading, adminOnly = false }) {
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <span className="text-sm font-medium text-[#5f6368]">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!session || isSessionExpired(session)) {
    return <Navigate to="/login" replace />;
  }

  return <Dashboard session={session} adminOnly={adminOnly} />;
}

function AuthLoginRoute({ session, isAuthLoading }) {
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <span className="text-sm font-medium text-[#5f6368]">Loading WriteCheck...</span>
        </div>
      </div>
    );
  }

  if (session && !isSessionExpired(session)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Startup initialAuthModal="login" />;
}

function AuthRegisterRoute({ session, isAuthLoading }) {
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <span className="text-sm font-medium text-[#5f6368]">Loading WriteCheck...</span>
        </div>
      </div>
    );
  }

  if (session && !isSessionExpired(session)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Startup initialAuthModal="register" />;
}

function HomeRoute({ session, isAuthLoading }) {
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#137333] border-t-transparent" />
          <span className="text-sm font-medium text-[#5f6368]">Loading WriteCheck...</span>
        </div>
      </div>
    );
  }

  // A valid Supabase session should always return to its dashboard, including
  // when someone manually removes /dashboard from the address bar.
  if (session && !isSessionExpired(session)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Startup />;
}

function App() {
  const [recovering, setRecovering] = useState(false);
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    // 1. Initial session check with expiration verification
    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => {
        if (currentSession && isSessionExpired(currentSession)) {
          signOutAndExpireToken("/login");
          setSession(null);
        } else {
          setSession(currentSession);
        }
        setIsAuthLoading(false);
      })
      .catch(() => {
        setIsAuthLoading(false);
      });

    // 2. Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (_event === "PASSWORD_RECOVERY") setRecovering(true);
        if (nextSession && isSessionExpired(nextSession)) {
          signOutAndExpireToken("/login");
          setSession(null);
        } else {
          setSession(nextSession);
        }
        setIsAuthLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // 3. Automatic timer for token expiration
  useEffect(() => {
    if (!session?.expires_at) return;

    const msUntilExpiry = session.expires_at * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      signOutAndExpireToken("/login");
      return;
    }

    const timer = setTimeout(() => {
      signOutAndExpireToken("/login");
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  }, [session?.expires_at]);

  // 4. Re-check expiry whenever user focuses the browser window or returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && session) {
        if (isSessionExpired(session)) {
          signOutAndExpireToken("/login");
        }
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [session]);

  return (
    <BrowserRouter
      future={{
        v7_relativeSplatPath: true,
        v7_startTransition: true,
      }}
    >
      {recovering && <Navigate to="/reset-password" replace />}
      <Routes>
        <Route path="/admin/*" element={<ProtectedDashboard session={session} isAuthLoading={isAuthLoading} adminOnly />} />
        <Route path="/forgot-password" element={<PasswordReset key="request" />} />
        <Route path="/reset-password" element={<PasswordReset key="reset" mode="reset" session={session} isAuthLoading={isAuthLoading} onComplete={() => setRecovering(false)} />} />
        <Route
          path="/"
          element={<HomeRoute session={session} isAuthLoading={isAuthLoading} />}
        />

        <Route
          path="/login"
          element={
            <AuthLoginRoute session={session} isAuthLoading={isAuthLoading} />
          }
        />

        <Route
          path="/register"
          element={
            <AuthRegisterRoute session={session} isAuthLoading={isAuthLoading} />
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedDashboard session={session} isAuthLoading={isAuthLoading} />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
