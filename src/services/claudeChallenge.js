const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "claude-opus-4-6";

function normalizeJsonText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

function toSafeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function toSafeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function sanitizeJsonText(input) {
  return String(input || "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function tryParseJson(text) {
  const normalized = normalizeJsonText(text);
  const candidates = [normalized, sanitizeJsonText(normalized)];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

function buildPromptText({ topicHint, difficulty, pointsText, extraNotes }) {
  return `Create ONE fresh challenge for students.\n\nAdmin preferences:\n- Topic / subject area: ${topicHint}\n- Difficulty: ${difficulty}\n- Key points to emphasize:\n${pointsText}\n- Extra notes: ${extraNotes || "None"}\n\nHard requirements:\n1) The challenge must be solvable in 30-120 minutes by a student.\n2) The task should test reasoning, edge cases, and implementation quality.\n3) Include clear input/output expectations in plain text.\n4) Include at least 3 explicit constraints (sizes, ranges, limits, or conditions).\n5) Include 2 representative examples (input and output) directly in plain text.\n6) Avoid requiring external APIs, paid services, or private datasets.\n7) Keep it original and production-relevant when possible.\n\nReturn strict JSON with EXACT keys:\n- title (string, <= 100 chars)\n- description (string, 4-8 sentences, detailed context and expectations)\n- problem_statement (string, structured plain text including objective, input, output, constraints, and examples)\n- answer_description (string, concise but in-depth solution idea: approach, complexity, edge cases)\n- deadline_days (integer from 1 to 7)\n\nOutput rules:\n- Return JSON object only.\n- No markdown fences.\n- No extra keys.\n- No links.`;
}

async function generateWithClaude({ apiKey, model, promptText }) {
  const body = {
    model,
    max_tokens: 1400,
    temperature: 0.75,
    system:
      "You are an expert competitive-programming and software-engineering challenge designer. Produce original, practical, and unambiguous challenges suitable for students. Never copy known platform problems verbatim. Return ONLY strict JSON with no markdown and no additional commentary.",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: promptText }],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const payload = await res.json();
  return (payload.content || [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function generateWithOpenAI({ apiKey, model, promptText }) {
  const body = {
    model,
    temperature: 0.75,
    max_completion_tokens: 1400,
    messages: [
      {
        role: "system",
        content:
          "You are an expert competitive-programming and software-engineering challenge designer. Return ONLY strict JSON with no markdown fences and no extra commentary.",
      },
      { role: "user", content: promptText },
    ],
  };

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const payload = await res.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

async function repairJsonWithClaude({ apiKey, model, rawText }) {
  const body = {
    model,
    max_tokens: 1400,
    temperature: 0,
    system: "Return ONLY valid strict JSON with no markdown and no extra text.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Fix the following malformed output into strict JSON using EXACT keys: title, description, problem_statement, answer_description, deadline_days.\n\nOutput to fix:\n${rawText}`,
          },
        ],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return "";
  const payload = await res.json();
  return (payload.content || [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function repairJsonWithOpenAI({ apiKey, model, rawText }) {
  const body = {
    model,
    temperature: 0,
    max_completion_tokens: 1400,
    messages: [
      {
        role: "system",
        content: "Return ONLY valid strict JSON with no markdown and no extra text.",
      },
      {
        role: "user",
        content: `Fix the following malformed output into strict JSON using EXACT keys: title, description, problem_statement, answer_description, deadline_days.\n\nOutput to fix:\n${rawText}`,
      },
    ],
  };

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return "";
  const payload = await res.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

export async function generateChallengeFromClaude(env, preferences = {}) {
  const selectedModel =
    (typeof preferences.model === "string" && preferences.model.trim()) ||
    env.CLAUDE_MODEL ||
    DEFAULT_MODEL;

  const useOpenAI = selectedModel.startsWith("gpt-");
  const topicHint =
    (typeof preferences.topic === "string" && preferences.topic.trim()) ||
    env.AI_CHALLENGE_TOPIC ||
    "mixed software engineering and logic";
  const difficulty =
    (typeof preferences.difficulty === "string" && preferences.difficulty.trim().toLowerCase()) ||
    "medium";
  const keyPoints = Array.isArray(preferences.keyPoints)
    ? preferences.keyPoints.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const extraNotes =
    typeof preferences.extraNotes === "string" ? preferences.extraNotes.trim().slice(0, 500) : "";

  const pointsText = keyPoints.length
    ? keyPoints.map((point, idx) => `${idx + 1}) ${point}`).join("\n")
    : "None provided";

  const promptText = buildPromptText({ topicHint, difficulty, pointsText, extraNotes });

  if (useOpenAI && !env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  if (!useOpenAI && !env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY secret");
  }

  const text = useOpenAI
    ? await generateWithOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: selectedModel,
        promptText,
      })
    : await generateWithClaude({
        apiKey: env.ANTHROPIC_API_KEY,
        model: selectedModel,
        promptText,
      });

  if (!text) {
    throw new Error("AI model returned empty response");
  }

  let parsed = tryParseJson(text);

  if (!parsed) {
    const repairedText = useOpenAI
      ? await repairJsonWithOpenAI({
          apiKey: env.OPENAI_API_KEY,
          model: selectedModel,
          rawText: text,
        })
      : await repairJsonWithClaude({
          apiKey: env.ANTHROPIC_API_KEY,
          model: selectedModel,
          rawText: text,
        });

    parsed = tryParseJson(repairedText);
  }

  if (!parsed) {
    throw new Error("AI response was not valid JSON after retry");
  }

  const title = toSafeText(parsed.title);
  const description = toSafeText(parsed.description);
  const problemStatement = toSafeText(parsed.problem_statement);
  const answerDescription = toSafeText(parsed.answer_description);
  const deadlineDaysRaw = toSafeInteger(parsed.deadline_days, 3);
  const deadlineDays = Math.max(1, Math.min(7, deadlineDaysRaw));

  if (!title || !description || !problemStatement) {
    throw new Error("Claude response missing required fields");
  }

  return {
    title,
    description,
    problemStatement,
    answerDescription: answerDescription || "Refer to challenge constraints and provide a clear, optimized solution.",
    deadlineDays,
  };
}
