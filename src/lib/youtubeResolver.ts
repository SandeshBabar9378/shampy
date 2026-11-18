import { query, queryOne } from "./db";

export async function resolveYouTubeVideoId(title: string, artist: string): Promise<string | null> {
  const cacheKey = `${title} ${artist} audio`.trim();

  // 1. Check local cache first
  try {
    const cached = await queryOne<{ youtube_id: string }>("SELECT youtube_id FROM yt_cache WHERE query = $1", [cacheKey]);
    if (cached && cached.youtube_id) {
      return cached.youtube_id;
    }
  } catch (err) {
    console.error("Cache read error:", err);
  }

  // 2. Fetch from YouTube Search
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cacheKey)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube search returned status ${response.status}`);
    }

    const html = await response.text();

    // Look for videoId patterns
    // Pattern A: "videoId":"..."
    const videoIdMatches = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
    let selectedId: string | null = null;

    if (videoIdMatches && videoIdMatches.length > 0) {
      for (const m of videoIdMatches) {
        const idMatch = m.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (idMatch && idMatch[1]) {
          selectedId = idMatch[1];
          break;
        }
      }
    }

    // Fallback Pattern B: /watch?v=...
    if (!selectedId) {
      const watchMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch && watchMatch[1]) {
        selectedId = watchMatch[1];
      }
    }

    if (selectedId) {
      // Save in cache
      try {
        await query(
          `INSERT INTO yt_cache (query, youtube_id, title, duration) VALUES ($1, $2, $3, $4)
           ON CONFLICT (query) DO UPDATE SET youtube_id = EXCLUDED.youtube_id, title = EXCLUDED.title, duration = EXCLUDED.duration`,
          [cacheKey, selectedId, `${title} - ${artist}`, 0]
        );
      } catch (cacheErr) {
        console.error("Cache write error:", cacheErr);
      }
      return selectedId;
    }
  } catch (error) {
    console.error("YouTube resolve error:", error);
  }

  return null;
}
