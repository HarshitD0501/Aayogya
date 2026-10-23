"use client";

import { useRouter } from "next/navigation";
import Landing from "@/components/Landing";

export default function Home() {
  const router = useRouter();

  const handleLaunchPwa = (patientId = "ramesh") => {
    router.push(`/app?patient=${patientId}`);
  };

  return (
    <Landing
      onEnter={() => router.push("/app")}
      onSelectDemo={(id) => handleLaunchPwa(id)}
      onOpenDashboard={() => router.push("/app")}
      onLoginSuccess={() => router.push("/app")}
      onLogout={() => {}}
    />
  );
}
