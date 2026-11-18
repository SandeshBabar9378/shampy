import React from "react";
import { AppShell } from "@/components/AppShell";

export default function AppRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
