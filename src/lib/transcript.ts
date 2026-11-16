// Helpers shared by the full-screen lyrics client and the /api/transcribe route.
// A transcript is the phonetic sound of a lyric line written in English (Latin) letters.

// Non-Latin letter ranges (BMP scripts that Shubhu song lyrics can contain:
// Devanagari, Gurmukhi, Arabic/Urdu, Bengali, Tamil, Telugu, etc.).
const NON_LATIN_LETTER =
  /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF\u1200-\u137F\u13A0-\u13FF\u1400-\u167F\u1680-\u169F\u16A0-\u16FF\u1700-\u17FF\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u1980-\u19FF\u1A00-\u1AAF\u1B00-\u1B7F\u1B80-\u1BFF\u1C00-\u1C7F\uA000-\uA4CF\uA500-\uA63F\uA640-\uA69F\uA6A0-\uA6FF\uA700-\uA71F\uA720-\uA7FF\uA800-\uA82F\uA840-\uA87F\uA880-\uA8DF\uA900-\uA92F\uA930-\uA95F\uA960-\uA97F\uA980-\uA9DF\uAA00-\uAA5F\uAA60-\uAA7F\uAA80-\uAADF\uAB00-\uAB2F\uABC0-\uABFF\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFB00-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF\uFF00-\uFFEF]/;

/** True when the text contains at least one letter from a non-Latin script. */
export function hasNonLatinLetters(text: string): boolean {
  return NON_LATIN_LETTER.test(text);
}

/** True when the text is written only with English / Latin letters and punctuation. */
export function isLatinText(text: string): boolean {
  return !hasNonLatinLetters(text);
}

/**
 * A transcript is valid when it is non-empty and, for a non-Latin source line,
 * it no longer contains any non-Latin script.
 */
export function isValidTranscript(original: string, transcript: string): boolean {
  const value = transcript.trim();
  if (!value) return original.trim().length === 0;
  if (hasNonLatinLetters(original) && hasNonLatinLetters(value)) return false;
  return true;
}

/** Validates a complete transcript list against the source lines. */
export function isValidTranscriptList(lines: string[], transcripts: unknown): transcripts is string[] {
  if (!Array.isArray(transcripts) || transcripts.length !== lines.length) return false;
  return transcripts.every(
    (item, index) => typeof item === "string" && isValidTranscript(lines[index], item)
  );
}

const GURMUKHI = new Map<string, string>([
  ["ਅ", "a"], ["ਆ", "aa"], ["ਇ", "i"], ["ਈ", "ee"], ["ਉ", "u"], ["ਊ", "oo"],
  ["ਏ", "e"], ["ਐ", "ai"], ["ਓ", "o"], ["ਔ", "au"],
  ["ਕ", "k"], ["ਖ", "kh"], ["ਗ", "g"], ["ਘ", "gh"], ["ਙ", "ng"],
  ["ਚ", "ch"], ["ਛ", "chh"], ["ਜ", "j"], ["ਝ", "jh"], ["ਞ", "ny"],
  ["ਟ", "t"], ["ਠ", "th"], ["ਡ", "d"], ["ਢ", "dh"], ["ਣ", "n"],
  ["ਤ", "t"], ["ਥ", "th"], ["ਦ", "d"], ["ਧ", "dh"], ["ਨ", "n"],
  ["ਪ", "p"], ["ਫ", "ph"], ["ਬ", "b"], ["ਭ", "bh"], ["ਮ", "m"],
  ["ਯ", "y"], ["ਰ", "r"], ["ਲ", "l"], ["ਵ", "v"], ["ਸ", "s"], ["ਹ", "h"],
  ["ੜ", "r"], ["ਸ਼", "sh"], ["ਖ਼", "kh"], ["ਗ਼", "g"], ["ਜ਼", "z"], ["ਫ਼", "f"],
  ["ਾ", "aa"], ["ਿ", "i"], ["ੀ", "ee"], ["ੁ", "u"], ["ੂ", "oo"],
  ["ੇ", "e"], ["ੈ", "ai"], ["ੋ", "o"], ["ੌ", "au"],
  ["ੰ", "n"], ["ਂ", "n"], ["ੱ", ""], ["੍", ""], ["਼", ""],
]);

const DEVANAGARI = new Map<string, string>([
  ["अ", "a"], ["आ", "aa"], ["इ", "i"], ["ई", "ee"], ["उ", "u"], ["ऊ", "oo"],
  ["ऋ", "ri"], ["ए", "e"], ["ऐ", "ai"], ["ओ", "o"], ["औ", "au"],
  ["क", "k"], ["ख", "kh"], ["ग", "g"], ["घ", "gh"], ["ङ", "ng"],
  ["च", "ch"], ["छ", "chh"], ["ज", "j"], ["झ", "jh"], ["ञ", "ny"],
  ["ट", "t"], ["ठ", "th"], ["ड", "d"], ["ढ", "dh"], ["ण", "n"],
  ["त", "t"], ["थ", "th"], ["द", "d"], ["ध", "dh"], ["न", "n"],
  ["प", "p"], ["फ", "ph"], ["ब", "b"], ["भ", "bh"], ["म", "m"],
  ["य", "y"], ["र", "r"], ["ल", "l"], ["व", "v"], ["श", "sh"],
  ["ष", "sh"], ["स", "s"], ["ह", "h"],
  ["ा", "aa"], ["ि", "i"], ["ी", "ee"], ["ु", "u"], ["ू", "oo"],
  ["ृ", "ri"], ["े", "e"], ["ै", "ai"], ["ो", "o"], ["ौ", "au"],
  ["ं", "n"], ["ँ", "n"], ["ः", "h"], ["्", ""], ["़", ""], ["ऽ", "a"],
  ["क़", "q"], ["ख़", "kh"], ["ग़", "gh"], ["ज़", "z"], ["ड़", "r"], ["ढ़", "rh"],
  ["फ़", "f"], ["य़", "y"],
]);

const ARABIC = new Map<string, string>([
  ["ا", "a"], ["آ", "aa"], ["أ", "a"], ["إ", "i"], ["ب", "b"], ["پ", "p"],
  ["ت", "t"], ["ٹ", "t"], ["ث", "s"], ["ج", "j"], ["چ", "ch"], ["ح", "h"],
  ["خ", "kh"], ["د", "d"], ["ڈ", "d"], ["ذ", "z"], ["ر", "r"], ["ڑ", "r"],
  ["ز", "z"], ["ژ", "zh"], ["س", "s"], ["ش", "sh"], ["ص", "s"], ["ض", "z"],
  ["ط", "t"], ["ظ", "z"], ["ع", ""], ["غ", "gh"], ["ف", "f"], ["ق", "q"],
  ["ک", "k"], ["گ", "g"], ["ل", "l"], ["م", "m"], ["ن", "n"], ["ں", "n"],
  ["و", "o"], ["ہ", "h"], ["ھ", "h"], ["ء", ""], ["ی", "y"], ["ے", "e"],
  ["ۃ", "h"], ["ؤ", "o"], ["ئ", "y"],
  ["َ", "a"], ["ِ", "i"], ["ُ", "u"], ["ً", "an"], ["ٍ", "in"], ["ٌ", "un"],
  ["ّ", ""], ["ْ", ""], ["ٰ", "a"],
]);

function mapCharacter(char: string): string | null {
  const gurmukhi = GURMUKHI.get(char);
  if (gurmukhi !== undefined) return gurmukhi;
  const devanagari = DEVANAGARI.get(char);
  if (devanagari !== undefined) return devanagari;
  const arabic = ARABIC.get(char);
  if (arabic !== undefined) return arabic;
  return null;
}

/**
 * Best-effort local Roman fallback used only when Gemini cannot provide a valid
 * transcript. It keeps the sound in English letters instead of showing the
 * original script in the big line.
 */
export function romanizeFallback(text: string): string {
  const out: string[] = [];
  for (const char of Array.from(text)) {
    const mapped = mapCharacter(char);
    if (mapped !== null) {
      out.push(mapped);
      continue;
    }
    if (char === "।" || char === "۔") {
      out.push(".");
      continue;
    }
    if (char === "؟") {
      out.push("?");
      continue;
    }
    // Drop any remaining letter from a script we cannot romanize.
    if (hasNonLatinLetters(char)) continue;
    out.push(char);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

/** Builds a safe Latin transcript for every line, used as a client/API fallback. */
export function buildFallbackTranscripts(lines: string[]): string[] {
  return lines.map((line) => {
    if (!hasNonLatinLetters(line)) return line;
    const romanized = romanizeFallback(line);
    return romanized || line;
  });
}
