import { getAiEnv } from "./envServer";

type OpenAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiCallResult = {
  content: string;
  model: string;
  provider: "openai";
  usage: unknown;
  responseId: string | null;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_NOTE_CHARS = 12000;
const MAX_SUMMARY_CHARS = 2000;

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated]`;
}

async function callOpenAiChat(
  messages: OpenAiMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<AiCallResult> {
  const env = getAiEnv();
  const model = env.OPENAI_MODEL ?? DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 700,
      }),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      usage?: unknown;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(json?.error?.message || "AI request failed");
    }

    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI response empty");
    }

    return {
      content,
      model,
      provider: "openai",
      usage: json?.usage ?? null,
      responseId: json?.id ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(jsonText) as unknown;

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown[] }).tasks)) {
    return (parsed as { tasks: unknown[] }).tasks;
  }

  throw new Error("AI response was not a JSON array");
}

export async function summarizeCommitteeNote(noteText: string): Promise<{
  summaryText: string;
  modelInfo: Record<string, unknown>;
  promptText: string;
}> {
  const trimmedNote = truncateText(noteText.trim(), MAX_NOTE_CHARS);

  const prompt =
    "Summarize this committee note for internal use. Return concise bullet points covering decisions, updates, and next steps. Keep it under 8 bullets.";

  const { content, model, provider, usage, responseId } = await callOpenAiChat([
    { role: "system", content: "You are a careful internal note summarizer." },
    { role: "user", content: `${prompt}\n\nNOTE:\n${trimmedNote}` },
  ]);

  const summaryText =
    content.length > MAX_SUMMARY_CHARS ? `${content.slice(0, MAX_SUMMARY_CHARS)}...` : content;

  return {
    summaryText,
    modelInfo: {
      provider,
      model,
      usage,
      response_id: responseId,
    },
    promptText: `${prompt}\n\n[content redacted; length=${noteText.length}]`,
  };
}

export async function extractSuggestedTasks(
  noteText: string,
  summaryText: string,
): Promise<{
  tasks: Array<{ title: string; description: string | null }>;
  modelInfo: Record<string, unknown>;
  promptText: string;
}> {
  const trimmedNote = truncateText(noteText.trim(), 6000);
  const trimmedSummary = truncateText(summaryText.trim(), 1500);

  const prompt =
    "From the committee note and summary, extract 3-8 actionable tasks. Return ONLY a JSON array of objects with: title (string) and description (string, optional).";

  const { content, model, provider, usage, responseId } = await callOpenAiChat([
    { role: "system", content: "You extract actionable tasks for a committee." },
    {
      role: "user",
      content: `${prompt}\n\nSUMMARY:\n${trimmedSummary}\n\nNOTE (abbrev):\n${trimmedNote}`,
    },
  ]);

  const parsed = extractJsonArray(content);
  const tasks = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { title?: unknown; description?: unknown };
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      const description =
        typeof raw.description === "string" && raw.description.trim().length > 0
          ? raw.description.trim()
          : null;
      if (!title) return null;
      return { title, description };
    })
    .filter((item): item is { title: string; description: string | null } => item !== null)
    .slice(0, 20);

  if (tasks.length === 0) {
    throw new Error("AI returned no tasks");
  }

  return {
    tasks,
    modelInfo: {
      provider,
      model,
      usage,
      response_id: responseId,
    },
    promptText: `${prompt}\n\n[content redacted; note_length=${noteText.length}, summary_length=${summaryText.length}]`,
  };
}
