const fs = require('fs');

async function testTranscription() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const lines = env.split(/\r?\n/);
  let apiKey = '';
  for (const line of lines) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      apiKey = line.split('=')[1].replace(/^["']|["']$/g, '');
    }
  }

  process.env.GEMINI_API_KEY = apiKey;

  const dilkoLyrics = [
    "दिल को तुमसे प्यार हुआ",
    "पहली बार हुआ",
    "तुमसे ही कह रहे हैं"
  ];

  async function transcribe(songId, inputLines) {
    const prompt = `You are a phonetic lyrics transcriber.
You are given a JSON array of song lyric lines (which may be in Gurmukhi, Devanagari, Urdu, Arabic, or Hinglish, or already in English letters).
Task: Transcribe each line phonetically into English letters (Roman script / Latin alphabet) keeping the original Hindi, Punjabi, or Urdu words as they sound.
Examples:
- "ਅੱਖੀਆਂ ਗੁਲਾਬ" -> "Akhiyaan gulaab"
- "दिल को तुमसे प्यार हुआ" -> "Dil ko tumse pyar hua"
- "ਸੋਹਣੀਏ ਤੂੰ ਲੱਗੇ ਮੈਨੂੰ ਚੰਨ ਵਰਗੀ" -> "Sohniye tu lagge mainu chann vargi"
- "पहली बार हुआ" -> "Pehli baar hua"

Strict Rules:
- DO NOT translate the meaning. Keep the words and pronunciation as spoken/sung in the song.
- If a line is already written in English letters (Latin alphabet), keep it as is.
- If a line is in Gurmukhi, Devanagari, Urdu, or any non-Latin script, transcribe it into English letters. NEVER return the original non-Latin script.
- Preserve the exact order and total line count. The output MUST be a JSON array of exactly ${inputLines.length} strings.
- Output format: return ONLY a valid raw JSON array of strings: ["line 1", "line 2", ...]. Do not include markdown codeblocks or explanations.`;

    const model = "gemini-3.8-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\nInput lines to transcribe:\n${JSON.stringify(inputLines)}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    });

    const status = res.status;
    const data = await res.json();
    console.log('Status:', status, 'Data:', JSON.stringify(data));
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return;
    const jsonStr = rawText.replace(/^```json\s*|```$/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    let transcribedCount = 0;
    const transcriptions = [];
    inputLines.forEach((orig, idx) => {
      const trans = parsed?.[idx]?.trim() || orig;
      transcriptions.push(trans);
      if (trans.toLowerCase() !== orig.toLowerCase()) transcribedCount++;
    });

    console.log(`[transcribe] songId: ${songId}, lines: ${inputLines.length}, transcribed: ${transcribedCount}, status: ${status}`);
    console.log('Original -> Roman transcript:');
    inputLines.forEach((orig, idx) => {
      console.log(`  [${orig}] -> [${transcriptions[idx]}]`);
    });
  }

  console.log('--- Testing Dilko Tumse Pyar Hua (Hindi) ---');
  await transcribe('dilko-tumse-test', dilkoLyrics);
}

testTranscription();
