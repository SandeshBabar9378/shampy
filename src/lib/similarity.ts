import { Track } from "./types";

/**
 * Scoring-based similarity:
 * 1. Same artist = +10
 * 2. Same genre = +5
 * 3. Same album = +4
 * 4. Same language = +3
 * 5. Partial artist match (featuring, collaborations) = +3
 */
export function getSimilarSongs(currentSong: Track, allSongs: Track[]): Track[] {
  if (!currentSong || !allSongs || allSongs.length === 0) return [];

  const artistLower = (currentSong.artist || "").toLowerCase();
  const featParts = artistLower.split(/[,&/|]|ft\.|feat\./).map((a) => a.trim()).filter(Boolean);

  const scored = allSongs
    .filter((s) => s.id !== currentSong.id && s.title.toLowerCase() !== currentSong.title.toLowerCase())
    .map((s) => {
      let score = 0;
      const sArtist = (s.artist || "").toLowerCase();
      const sGenre = (s.genre || "").toLowerCase();
      const sLang = (s.language || "").toLowerCase();
      const sAlbum = (s.album || "").toLowerCase();

      // Same artist = highest priority
      if (sArtist === artistLower) score += 10;
      // Partial artist match (collaborations)
      else if (featParts.some((part) => part.length > 2 && sArtist.includes(part))) score += 3;

      // Same genre
      if (sGenre && currentSong.genre && sGenre === (currentSong.genre || "").toLowerCase()) score += 5;

      // Same album
      if (sAlbum && currentSong.album && sAlbum === (currentSong.album || "").toLowerCase()) score += 4;

      // Same language
      if (sLang && currentSong.language && sLang === (currentSong.language || "").toLowerCase()) score += 3;

      return { track: s, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);

  // If no similar songs found, fallback to same language or random from pool
  if (scored.length === 0) {
    const langFallback = allSongs.filter(
      (s) => s.id !== currentSong.id && s.language && s.language === currentSong.language
    );
    return langFallback.length > 0 ? langFallback : allSongs.filter((s) => s.id !== currentSong.id);
  }

  return scored;
}
