export type ScriptClassification = "devanagari" | "roman" | "other";

export interface BracketExtraction {
  hasBrackets: boolean;
  prefix: string;
  innerText: string;
  suffix: string;
}

/**
 * Strips surrounding brackets/parentheses and ad-lib markers.
 * E.g.: "(Hangover... teri yaadon ka)" -> prefix="(", innerText="Hangover... teri yaadon ka", suffix=")"
 */
export function extractBrackets(line: string): BracketExtraction {
  const trimmed = line.trim();
  const match = trimmed.match(/^([(\[{<"']+\s*)(.*?)(\s*[)\]}>"']+)$/);
  if (match) {
    return {
      hasBrackets: true,
      prefix: match[1],
      innerText: match[2].trim(),
      suffix: match[3],
    };
  }
  return {
    hasBrackets: false,
    prefix: "",
    innerText: trimmed,
    suffix: "",
  };
}

/**
 * Classifies a lyric line or inner text:
 * - If the line has any character in the Devanagari range (U+0900 to U+097F), it is "devanagari".
 * - If the line has Latin letters and no Devanagari, it is "roman".
 * - Otherwise "other" (numbers, symbols only).
 */
export function classifyScript(text: string): ScriptClassification {
  // Check for any Devanagari character
  if (/[\u0900-\u097F]/.test(text)) {
    return "devanagari";
  }
  // Check for Latin letters
  if (/[a-zA-Z]/.test(text)) {
    return "roman";
  }
  return "other";
}
