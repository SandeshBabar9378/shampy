import { NextRequest, NextResponse } from "next/server";

interface TranslateRequestBody {
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

async function requestTranslation(lines: string[], apiKey: string): Promise<{ parsed: string[] | null; status: number }> {
  const prompt = `You are a professional music lyric translator.
You are given a JSON array of song lyric lines (which may be in Punjabi, Hindi, Urdu, Hinglish, Spanish, or other languages, or already English).
Task: Translate every single line into natural, meaningful, poetic English.
Strict Rules:
- If a line is already in natural English, keep it as is.
- If a line is in any other language or script (such as Gurmukhi, Devanagari, Urdu, Arabic, Roman/Hinglish, etc.), translate its meaning into natural English. NEVER return the original non-English script as the translation.
- Preserve the exact order and line count. The output MUST be a JSON array of exactly ${lines.length} strings.
- Output format: return ONLY a raw JSON array of strings: ["line 1", "line 2", ...]. Do not include markdown codeblocks or explanations.`;

  const model = "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${prompt}\n\nInput lines to translate:\n${JSON.stringify(lines)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    return { parsed: null, status: res.status };
  }

  const data = (await res.json()) as GeminiGenerateContentResponse;
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) {
    return { parsed: null, status: res.status };
  }

  try {
    const jsonStr = rawText.replace(/^```json\s*|```$/g, "").trim();
    const arr = JSON.parse(jsonStr) as string[];
    if (Array.isArray(arr)) {
      return { parsed: arr, status: res.status };
    }
  } catch {
    // Parsing error
  }

  return { parsed: null, status: res.status };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("English translation disabled: no API key");
    return NextResponse.json({
      translations: [],
      error: "English translation disabled: no API key",
    });
  }

  let body: TranslateRequestBody;
  try {
    body = (await req.json()) as TranslateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const songId = body?.songId || "unknown";
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json({ translations: [] });
  }

  try {
    let { parsed, status } = await requestTranslation(lines, apiKey);

    // Check for failure or original script returned:
    // If output is invalid or any non-English line was returned identically, retry once
    let needsRetry = !parsed || parsed.length !== lines.length;
    if (!needsRetry && parsed) {
      const identicalCount = lines.filter((l, i) => l.trim().length > 0 && l.trim() === parsed?.[i]?.trim()).length;
      // If all lines were returned identical and there are non-ASCII characters, retry
      const hasNonAscii = lines.some((l) => /[^\u0000-\u007F]/.test(l));
      if (hasNonAscii && identicalCount === lines.length) {
        needsRetry = true;
      }
    }

    if (needsRetry) {
      const retryResult = await requestTranslation(lines, apiKey);
      if (retryResult.parsed && retryResult.parsed.length === lines.length) {
        parsed = retryResult.parsed;
        status = retryResult.status;
      }
    }

    const translations: string[] = [];
    let translatedCount = 0;

    lines.forEach((originalLine, idx) => {
      const translated = parsed?.[idx]?.trim();
      if (!translated) {
        translations.push(originalLine);
      } else {
        translations.push(translated);
        if (translated !== originalLine) {
          translatedCount++;
        }
      }
    });

    // Required logging: song id, number of lines, number translated, Gemini HTTP status. Never log lyric text.
    console.log(`[translate] songId: ${songId}, lines: ${lines.length}, translated: ${translatedCount}, status: ${status}`);

    return NextResponse.json({ translations });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[translate] Exception: ${errMsg}`);
    return NextResponse.json({ translations: lines, error: errMsg });
  }
}
