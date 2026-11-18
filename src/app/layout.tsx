import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "Shubhu",
  description: "Shubhu — Your personal music player powered by YouTube",
  applicationName: "Shubhu",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  // iOS home-screen app: full-screen, opaque status bar so content never
  // slides under the clock/notch.
  appleWebApp: {
    capable: true,
    title: "Shubhu",
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0812",
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
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
