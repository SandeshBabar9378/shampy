import type { Metadata } from "next";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";

export const metadata: Metadata = {
  title: "Shubhu",
  description: "Shubhu — Your personal music player powered by YouTube",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-black text-white antialiased">
      <body className="h-full overflow-hidden bg-black text-white font-sans">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
