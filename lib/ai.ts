import { TASK_PRIORITIES } from "@/lib/ui";

export type TaskDraft = {
  title: string;
  description: string;
  priority: string;
  dueDate: string | null; // YYYY-MM-DD
};

export type DraftResult = { ok: true; draft: TaskDraft } | { ok: false; error: string };

const PRIORITY_VALUES = TASK_PRIORITIES.map((p) => p.value);

/**
 * Turns pasted text and/or a screenshot into a structured task draft using
 * Google's Gemini API (it has a genuinely free tier — see .env.example). Never
 * throws: any failure (missing key, network error, bad response) comes back
 * as `{ ok: false, error }` so the caller can show it inline.
 */
export async function draftTaskFromInput(opts: {
  text: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<DraftResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AI drafting isn't set up yet — ask an admin to add a GEMINI_API_KEY (see .env.example).",
    };
  }
  if (!opts.text.trim() && !opts.imageBase64) {
    return { ok: false, error: "Paste some text or an image first." };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const today = new Date().toISOString().slice(0, 10);

  const parts: Record<string, unknown>[] = [
    {
      text:
        `You are a task-extraction assistant inside an internal task manager. Read the pasted content below ` +
        `(and the attached image, if any) and extract ONE actionable task from it. Today's date is ${today}. ` +
        `If a due date is stated or clearly implied (e.g. "by Friday", "next week"), resolve it to an absolute ` +
        `date in YYYY-MM-DD format; otherwise set dueDate to null. Keep the title under 12 words; put any extra ` +
        `detail in the description. Respond with JSON only, matching the given schema.\n\n` +
        `Content:\n${opts.text || "(see attached image)"}`,
    },
  ];
  if (opts.imageBase64 && opts.imageMimeType) {
    parts.push({ inlineData: { mimeType: opts.imageMimeType, data: opts.imageBase64 } });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                priority: { type: "STRING", enum: PRIORITY_VALUES },
                dueDate: { type: "STRING", nullable: true },
              },
              required: ["title", "priority"],
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[ai draft] Gemini API error ${res.status}:`, body.slice(0, 500));
      return {
        ok: false,
        error: `AI request failed (${res.status}). Check the GEMINI_API_KEY / GEMINI_MODEL server config.`,
      };
    }

    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return { ok: false, error: "AI returned an empty response — try adding more detail." };

    const parsed = JSON.parse(raw);
    const title = String(parsed.title ?? "").trim().slice(0, 300);
    if (!title) return { ok: false, error: "AI couldn't find a clear task in that — try rephrasing." };

    const priority = PRIORITY_VALUES.includes(parsed.priority) ? parsed.priority : "MEDIUM";
    const dueDate =
      typeof parsed.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ? parsed.dueDate : null;
    const description = String(parsed.description ?? "").trim().slice(0, 2000);

    return { ok: true, draft: { title, description, priority, dueDate } };
  } catch (e) {
    console.error("[ai draft] failed:", e);
    return { ok: false, error: "Something went wrong drafting the task. Please try again." };
  }
}
