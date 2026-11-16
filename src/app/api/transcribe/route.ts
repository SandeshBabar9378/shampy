import { NextRequest, NextResponse } from "next/server";
import {
  buildFallbackTranscripts,
  hasNonLatinLetters,
  isValidTranscript,
  isValidTranscriptList,
} from "@/lib/transcript";

interface TranscribeRequestBody {
  songId?: string;
  lines?: string[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

// Flash-lite models answered fastest and most reliably for short phonetic
// transcriptions. The first available model wins.
const TRANSCRIBE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const REQUEST_TIMEOUT_MS = 20_000;

async function requestTranscription(lines: string[], apiKey: string): Promise<{ parsed: string[] | null; status: number }> {
  const prompt = `You are a phonetic lyrics transcriber.
You are given a JSON array of song lyric lines (which may be in Gurmukhi, Devanagari, Urdu, Arabic, or Hinglish, or already in English letters).
Task: Transcribe each line phonetically into English letters (Roman script / Latin alphabet), keeping the original Hindi, Punjabi, or Urdu words exactly as they sound.
Write natural, everyday Hinglish spelling, the way these lyrics are normally typed online - not a character-by-character academic transliteration.
Examples:
- "ਅੱਖੀਆਂ ਗੁਲਾਬ" -> "Akhiyaan gulaab"
- "दिल को तुमसे प्यार हुआ" -> "Dil ko tumse pyar hua"
- "ਸੋਹਣੀਏ ਤੂੰ ਲੱਗੇ ਮੈਨੂੰ ਚੰਨ ਵਰਗੀ" -> "Sohniye tu lagge mainu chann vargi"
- "पहली बार हुआ" -> "Pehli baar hua"
- "मेरी जां कहो मैं क्या करूं" -> "Meri jaan kaho main kya karun"

Strict Rules:
- DO NOT translate the meaning. Keep the words and pronunciation as sung in the song.
- If a line is already written in English letters (Latin alphabet), keep it exactly as is.
- If a line is in Gurmukhi, Devanagari, Urdu, or any non-Latin script, transcribe it into English letters. NEVER return the original non-Latin script.
- Preserve the exact order and total line count. The output MUST be a JSON array of exactly ${lines.length} strings.
- Output format: return ONLY a valid raw JSON array of strings: ["line 1", "line 2", ...]. Do not include markdown codeblocks or explanations.`;

  let lastStatus = 0;

  for (const model of TRANSCRIBE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${prompt}\n\nInput lines to transcribe:\n${JSON.stringify(lines)}` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      lastStatus = res.status;
      if (!res.ok) {
        continue;
      }

      const data = (await res.json()) as GeminiGenerateContentResponse;
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawText) {
        continue;
      }

      const jsonStr = rawText.replace(/^```json\s*|```$/g, "").trim();
      const arr: unknown = JSON.parse(jsonStr);
      if (Array.isArray(arr) && arr.every((item) => typeof item === "string")) {
        return { parsed: arr as string[], status: res.status };
      }
      return { parsed: null, status: res.status };
    } catch {
      // Network error or timeout: try the next available model.
      lastStatus = 0;
    }
  }

  return { parsed: null, status: lastStatus };
}

export async function POST(req: NextRequest) {
  let body: TranscribeRequestBody;
  try {
    body = (await req.json()) as TranscribeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const songId = body?.songId || "unknown";
  const lines = Array.isArray(body?.lines) ? body.lines.filter((line) => typeof line === "string") : [];
  if (lines.length === 0) {
    return NextResponse.json({ transcriptions: [] });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("transcription disabled: no API key");
    console.log(`[transcribe] songId: ${songId}, lines: ${lines.length}, transcribed: 0, status: disabled`);
    return NextResponse.json({
      transcriptions: [],
      error: "transcription disabled: no API key",
    });
  }

  try {
    // Timed blank lines are common in LRC files. Sending them to Gemini can make
    // the model collapse the array and shift every index, so transcribe only the
    // non-empty lines and re-insert blanks afterwards.
    const sourceLines = lines.filter((line) => line.trim().length > 0);
    if (sourceLines.length === 0) {
      console.log(`[transcribe] songId: ${songId}, lines: ${lines.length}, transcribed: 0, status: 200`);
      return NextResponse.json({ transcriptions: lines.map(() => "") });
    }

    let { parsed, status } = await requestTranscription(sourceLines, apiKey);
    let valid = isValidTranscriptList(sourceLines, parsed);

    // Rule 4: if the model returned the original script (or an incomplete list),
    // treat it as a failure and retry exactly once.
    if (!valid) {
      const retryResult = await requestTranscription(sourceLines, apiKey);
      status = retryResult.status;
      if (isValidTranscriptList(sourceLines, retryResult.parsed)) {
        parsed = retryResult.parsed;
        valid = true;
      }
    }

    // Never show the original script in the big line: per-line fallback to a
    // local Roman transcription when Gemini still failed for that line.
    const fallback = buildFallbackTranscripts(sourceLines);
    const transcribedLines: string[] = sourceLines.map((originalLine, index) => {
      const candidate = parsed?.[index]?.trim();
      if (candidate && isValidTranscript(originalLine, candidate)) return candidate;
      if (!hasNonLatinLetters(originalLine) && originalLine.trim()) return originalLine;
      return fallback[index];
    });

    let cursor = 0;
    const transcriptions: string[] = lines.map((line) => {
      if (!line.trim()) return "";
      const value = transcribedLines[cursor];
      cursor += 1;
      return value;
    });

    const transcribedCount = transcriptions.reduce(
      (count, value, index) => (value.trim() !== lines[index].trim() ? count + 1 : count),
      0
    );

    // Rule 6: one line per request: song id, number of lines, number transcribed,
    // Gemini HTTP status. Never log lyric text.
    console.log(
      `[transcribe] songId: ${songId}, lines: ${lines.length}, transcribed: ${transcribedCount}, status: ${status}${valid ? "" : " (fallback)"}`
    );

    return NextResponse.json({ transcriptions });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[transcribe] Exception: ${errMsg}`);
    console.log(`[transcribe] songId: ${songId}, lines: ${lines.length}, transcribed: 0, status: 0`);
    return NextResponse.json({ transcriptions: buildFallbackTranscripts(lines), error: errMsg });
  }
}
