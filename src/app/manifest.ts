import type { MetadataRoute } from "next";

// Makes Shubhu installable ("Add to Home Screen" / "Install app") so it opens
// full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shubhu",
    short_name: "Shubhu",
    description: "Your personal music player powered by YouTube",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Matches the default Aurora theme background so the splash screen and
    // status bar blend into the app.
    background_color: "#0b0812",
    theme_color: "#0b0812",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
