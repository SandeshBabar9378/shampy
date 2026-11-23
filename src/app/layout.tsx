import type { Metadata, Viewport } from "next";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[var(--background)] text-[var(--foreground)] antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
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
