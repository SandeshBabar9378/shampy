import { NextRequest, NextResponse } from "next/server";

interface TransliterateRequestBody {
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("transliteration disabled: no API key");
    return NextResponse.json({ transliterations: {} });
  }

  let body: TransliterateRequestBody;
  try {
    body = (await req.json()) as TransliterateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lines = Array.isArray(body?.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json({ transliterations: {} });
  }

  const prompt = `You are a transliterator for song lyrics.
You are given a JSON array of lyric lines written in Roman script.
For each line:
- If the line is Hindi / Urdu / Hinglish / Punjabi in Roman script, provide its phonetic transliteration in Devanagari script.
- If the line is strictly English (or non-Hindi words/sound effects/empty), return an empty string "".
- Return ONLY a JSON array of strings matching the length of the input.`;

  try {
    const model = "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${prompt}\n${JSON.stringify(lines)}` }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    console.log(`[transliterate] Gemini HTTP status: ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[transliterate] Gemini error status ${res.status}: ${errText}`);
      return NextResponse.json({ transliterations: {} });
    }

    const data = (await res.json()) as GeminiGenerateContentResponse;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rawText) {
      console.log("empty response from Gemini");
      return NextResponse.json({ transliterations: {} });
    }

    let parsed: string[] = [];
    try {
      parsed = JSON.parse(rawText) as string[];
    } catch {
      console.error("[transliterate] Failed to parse JSON response from Gemini");
      return NextResponse.json({ transliterations: {} });
    }

    const transliterations: Record<string, string> = {};
    if (Array.isArray(parsed)) {
      lines.forEach((line, idx) => {
        const devanagari = parsed[idx]?.trim();
        if (devanagari) {
          // If the model returned the exact same text as the input for a roman line,
          // treat it as a failure, do not cache/return it, and log the failure.
          if (devanagari.toLowerCase() === line.toLowerCase()) {
            console.log(`transliteration returned original text for line ${idx}`);
          } else {
            transliterations[line] = devanagari;
          }
        }
      });
    }

    return NextResponse.json({ transliterations });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[transliterate] Exception: ${errMsg}`);
    return NextResponse.json({ transliterations: {} });
  }
}

