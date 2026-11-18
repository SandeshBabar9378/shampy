import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";

export const metadata: Metadata = {
  title: "Shubhu",
  description: "Shubhu — Your personal music player powered by YouTube",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[var(--background)] text-[var(--foreground)] antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('shubhu_theme');if(t!=='ocean'&&t!=='graphite')t='aurora';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body className="h-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] font-sans">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
