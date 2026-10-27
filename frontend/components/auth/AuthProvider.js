"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, clearToken, setActivePatientId } from "@/lib/api";
import { rememberWorkspaceRole, clearWorkspaceRoleHint } from "@/lib/workspacePreload";
import LoginDialog from "./LoginDialog";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionRetryToken, setSessionRetryToken] = useState(0);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  const returnPathRef = useRef("/app");
  const triggerElRef = useRef(null);
  const authVersionRef = useRef(0);

  // Validate that a return path is a safe relative path starting with '/'
  const sanitizeReturnPath = (path) => {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      return "/app";
    }
    return path;
  };

  // Open the shared login modal
  const openLogin = useCallback((destinationPath = "/app", options = {}) => {
    // If destinationPath is an event or invalid, fallback to /app
    const safePath = typeof destinationPath === "string" ? sanitizeReturnPath(destinationPath) : "/app";
    returnPathRef.current = safePath;
    if (safePath.startsWith("/app")) {
      router.prefetch("/app");
    }

    if (options.triggerEl) {
      triggerElRef.current = options.triggerEl;
    } else if (typeof document !== "undefined" && document.activeElement) {
      triggerElRef.current = document.activeElement;
    }

    setLoginMessage(options.message || "");
    setIsLoginOpen(true);
  }, [router]);

  // Close the login modal and return focus to initiating trigger
  const closeLogin = useCallback(() => {
    setIsLoginOpen(false);
    setLoginMessage("");
    if (triggerElRef.current && typeof triggerElRef.current.focus === "function") {
      try {
        triggerElRef.current.focus();
      } catch {}
    }
  }, []);

  // Handle successful login or account registration
  const handleLoginSuccess = useCallback((authenticatedUser) => {
    authVersionRef.current += 1;
    setUser(authenticatedUser);
    rememberWorkspaceRole(authenticatedUser?.role);
    setSessionError("");
    setReady(true);
    if (authenticatedUser?.id) {
      setActivePatientId(authenticatedUser.id);
    }
    setIsLoginOpen(false);
    setLoginMessage("");

    if (triggerElRef.current && typeof triggerElRef.current.focus === "function") {
      try {
        triggerElRef.current.focus();
      } catch {}
    }

    const destination = returnPathRef.current || "/app";
    if (typeof window !== "undefined" && window.location.pathname !== destination) {
      router.push(destination);
    }
  }, [router]);

  // Explicit user logout
  const logout = useCallback(() => {
    authVersionRef.current += 1;
    clearToken();
    clearWorkspaceRoleHint();
    setActivePatientId(null);
    setUser(null);
    setSessionError("");
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
      router.push("/");
    }
  }, [router]);

  const retrySession = useCallback(() => {
    authVersionRef.current += 1;
    setSessionError("");
    setReady(false);
    setSessionRetryToken((value) => value + 1);
  }, []);

  // Initial session hydration
  useEffect(() => {
    let alive = true;
    const checkVersion = authVersionRef.current;

    async function checkSession() {
      const token = getToken();
      if (!token) {
        if (alive && checkVersion === authVersionRef.current) {
          setUser(null);
          setReady(true);
        }
        return;
      }

      try {
        const me = await api("/auth/me", { timeoutMs: 12000 });
        if (alive && checkVersion === authVersionRef.current) {
          setUser(me);
          rememberWorkspaceRole(me?.role);
          setSessionError("");
          if (me?.id) setActivePatientId(me.id);
          setReady(true);
        }
      } catch (error) {
        if (alive && checkVersion === authVersionRef.current) {
          // A temporary network/server failure must not discard a valid token.
          // api() already clears the token when the server returns 401.
          const isAbort =
            error?.name === "AbortError" ||
            error?.name === "TimeoutError" ||
            error?.message?.toLowerCase().includes("abort");
          const msg = isAbort
            ? "Connection timed out. Please check that the server is running."
            : error.message || "Session verification is unavailable.";

          if (getToken()) setSessionError(msg);
          else {
            clearWorkspaceRoleHint();
            setSessionError("");
          }
          setUser(null);
          setReady(true);
        }
      }
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [sessionRetryToken]);

  // Listen for F03 401 session expiry events dispatched by lib/api.js
  useEffect(() => {
    const handleLogoutEvent = () => {
      authVersionRef.current += 1;
      clearToken();
      clearWorkspaceRoleHint();
      setUser(null);
      setSessionError("");
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "/app";
      openLogin(currentPath, {
        message: "Your session has expired. Please sign in again.",
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("aushadh:logout", handleLogoutEvent);
      return () => {
        window.removeEventListener("aushadh:logout", handleLogoutEvent);
      };
    }
  }, [openLogin]);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        patient: user,
        setPatient: setUser,
        ready,
        sessionError,
        retrySession,
        isLoginOpen,
        openLogin,
        closeLogin,
        logout,
      }}
    >
      {children}
      <LoginDialog
        isOpen={isLoginOpen}
        onClose={closeLogin}
        onSuccess={handleLoginSuccess}
        initialMessage={loginMessage}
      />
    </AuthContext.Provider>
  );
}
