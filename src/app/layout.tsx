import type { Metadata, Viewport } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  DEFAULT_THEME,
  THEME_IDS,
  THEME_STORAGE_KEY,
} from "@/lib/theme";
import { DATA_MODE_STORAGE_KEY } from "@/lib/dataMode";

// Shubhu's two voices: Sora carries the interface, Fraunces carries the
// editorial headlines (greeting, shelf titles, page titles). Both are exposed
// as CSS variables so every component reads one type system.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

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

// Applies the saved theme before first paint, then removes the attribute so
// React hydrates the exact server markup. The temporary <style> is filled from
// the theme rules already defined in globals.css, so colours live in one place.
const themeBootstrap = `
(function () {
  var key = ${JSON.stringify(THEME_STORAGE_KEY)};
  var ids = ${JSON.stringify(THEME_IDS)};
  var fallback = ${JSON.stringify(DEFAULT_THEME)};
  var stored = null;
  try { stored = localStorage.getItem(key); } catch (e) {}
  var theme = ids.indexOf(stored) !== -1 ? stored : fallback;
  var token = '[data-theme="' + theme + '"]';

  document.documentElement.setAttribute('data-theme', theme);

  var css = '';
  try {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sheet = document.styleSheets[i];
      var rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        var selector = rule.selectorText;
        var declarations = rule.style && rule.style.cssText;
        if (!selector || !declarations || selector.indexOf(token) === -1) continue;
        css += selector.split(token).join(':root') + '{' + declarations + '}';
      }
    }
  } catch (e) {}

  if (css) {
    var old = document.getElementById('shubhu-theme-prepaint');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var style = document.createElement('style');
    style.id = 'shubhu-theme-prepaint';
    style.textContent = css;
    document.head.appendChild(style);
  }

  var removeAttributeBeforeHydration = function () {
    document.documentElement.removeAttribute('data-theme');
  };
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(removeAttributeBeforeHydration);
  } else {
    Promise.resolve().then(removeAttributeBeforeHydration);
  }
})();
`;

// The data-saver preference must be available before React effects run so the
// first search/recommend request and every non-React downloader agree on it.
// This pre-paint script mutates <html> after the server HTML is parsed and
// before React hydrates, so <html> carries suppressHydrationWarning: React
// must keep the DOM value instead of treating the extra attribute as a mismatch.
const dataModeBootstrap = `
(function () {
  var stored = null;
  try { stored = localStorage.getItem(${JSON.stringify(DATA_MODE_STORAGE_KEY)}); } catch (e) {}
  document.documentElement.setAttribute('data-data-mode', stored === 'low' ? 'low' : 'high');
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark h-full bg-[var(--background)] text-[var(--foreground)] antialiased ${sora.variable} ${fraunces.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: dataModeBootstrap }} />
      </head>
      <body className="h-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] font-sans">
        <ThemeProvider>
          <PlayerProvider>{children}</PlayerProvider>
          <ServiceWorkerRegister />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
