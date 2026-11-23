import React from "react";
import { AppShell } from "@/components/AppShell";

/**
 * Keeps the public /settings URL while reusing the phone bottom navigation and
 * mini-player. The rest of the shell is suppressed so the desktop Settings
 * page keeps its existing standalone layout.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell phoneChromeOnly>{children}</AppShell>;
}
