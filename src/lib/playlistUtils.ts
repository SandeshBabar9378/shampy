/**
 * Community / Fan-made playlist detection helper.
 *
 * DEFINITION:
 * A "fan-made" playlist is a public YouTube playlist whose author is NOT an official channel.
 * Treat as official: names ending in "- Topic", "YouTube Music", "VEVO", "T-Series",
 * "Saregama", "Zee Music Company", "Sony Music", "Times Music", or any name that matches
 * the artist's own name. Everything else is community.
 */

const KNOWN_OFFICIAL_NAMES = [
  "youtube music",
  "vevo",
  "t-series",
  "saregama",
  "zee music company",
  "sony music",
  "times music",
  "yrf",
  "tips official",
  "speed records",
  "white hill music",
];

export function isCommunityPlaylist(author: string, artistName?: string): boolean {
  if (!author) return true;
  const trimmed = author.trim();
  const lower = trimmed.toLowerCase();

  // Ends in - Topic
  if (lower.endsWith("- topic") || lower.endsWith(" topic")) {
    return false;
  }

  // Known official names
  for (const official of KNOWN_OFFICIAL_NAMES) {
    if (lower === official || lower.includes(official)) {
      return false;
    }
  }

  // Matches artist's own name
  if (artistName) {
    const artistLower = artistName.trim().toLowerCase();
    if (artistLower && (lower === artistLower || lower.includes(artistLower))) {
      return false;
    }
  }

  return true;
}
