"use client";

import { useRouter } from "next/navigation";
import Landing from "@/components/Landing";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { openLogin, user } = useAuth();

  return (
    <Landing
      patient={user}
      onOpenAuth={() => openLogin("/app")}
      onEnter={() => {
        if (user) router.push("/app");
        else openLogin("/app");
      }}
      onOpenDashboard={() => {
        if (user) router.push("/app");
        else openLogin("/app");
      }}
      onLoginSuccess={() => router.push("/app")}
      onLogout={() => {}}
    />
  );
}
