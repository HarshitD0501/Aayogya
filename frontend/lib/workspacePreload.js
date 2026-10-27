"use client";

const ROLE_HINT_KEY = "aushadh_workspace_role";

export function rememberWorkspaceRole(role) {
  if (typeof window === "undefined") return;
  if (role === "caregiver" || role === "patient") {
    window.sessionStorage.setItem(ROLE_HINT_KEY, role);
  }
}

export function getWorkspaceRoleHint() {
  if (typeof window === "undefined") return null;
  const role = window.sessionStorage.getItem(ROLE_HINT_KEY);
  return role === "caregiver" || role === "patient" ? role : null;
}

export function clearWorkspaceRoleHint() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(ROLE_HINT_KEY);
}

// This hint only fetches code. It never authenticates or unlocks patient data.
// The imports match the dynamic components used by /app.
export function preloadWorkspace(role) {
  return role === "caregiver"
    ? import("@/components/Caregiver")
    : import("@/components/Dashboard");
}
