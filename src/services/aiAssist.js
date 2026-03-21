const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "claude-opus-4-6";
const HINT_MODEL = "gpt-5.1-2025-11-13";

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

function pickModel(_env, modelOverride) {
  // Default model for non-hint AI calls.
  const model = modelOverride || "gpt-5-mini";
  return { model, useOpenAI: true };
}

async function callClaudeChat({ apiKey, model, system, messages, maxTokens = 800, temperature = 0.7 }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ type: "text", text: m.content }],
    })),
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

async function callOpenAIChat({ apiKey, model, system, messages, maxTokens = 800, temperature = 0.7 }) {
  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      ...(system
        ? [{ role: "system", content: system }]
        : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  // Some models like gpt-5-mini only support the default temperature.
  // For those, omit the temperature field so the API uses its default.
  if (typeof temperature === "number" && model !== "gpt-5-mini") {
    body.temperature = temperature;
  }

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

async function callChatModel(env, { system, messages, maxTokens, temperature, modelOverride }) {
  const { model, useOpenAI } = pickModel(env, modelOverride);

  if (useOpenAI) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY secret");
    }
    return callOpenAIChat({
      apiKey: env.OPENAI_API_KEY,
      model,
      system,
      messages,
      maxTokens,
      temperature,
    });
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY secret");
  }

  return callClaudeChat({
    apiKey: env.ANTHROPIC_API_KEY,
    model,
    system,
    messages,
    maxTokens,
    temperature,
  });
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w && w.length >= 3)
  );
}

function jaccardSimilarity(a, b) {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function isLowQualityHint(text, shortDesc) {
  const t = String(text || "").trim();
  if (!t || t.length < 40) return true;
  if (t.length > 800) return true;

  const low = t.toLowerCase();
  const bannedStarts = [
    "use one small concrete example from",
    "turn your traced example for",
    "for in modern messaging applications",
  ];
  if (bannedStarts.some((x) => low.startsWith(x))) return true;

  if (shortDesc) {
    const desc = String(shortDesc || "").trim();
    const descHead = desc.slice(0, 220).toLowerCase();
    if (descHead && low.includes(descHead)) return true;
    if (jaccardSimilarity(t, desc) > 0.9) return true;
  }

  return false;
}

function extractAiHintCandidate(raw) {
  const parsed = tryParseJson(raw) || {};
  const parsedText = String(parsed.text || "").trim();
  if (parsedText) return parsedText;

  const cleaned = String(raw || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!cleaned) return "";

  const withoutLabel = cleaned
    .replace(/^hint\s*\d*\s*[:\-]\s*/i, "")
    .trim();

  return withoutLabel;
}

export async function generateHintForLevel(env, { challenge, level, previousHints = [] }) {
  const safeTitle = challenge?.title || "Untitled Challenge";
  const shortDesc = (challenge?.description || "").slice(0, 1200);
  const solutionSummary = (challenge?.answer_description || "").slice(0, 1600);
  const safeLevel = [1, 2, 3, 4].includes(Number(level)) ? Number(level) : 1;

  const previousBlock = previousHints
    .filter((h) => String(h || "").trim())
    .map((h, idx) => `Hint ${idx + 1}: ${String(h).trim()}`)
    .join("\n");

  const levelPromptByLevel = {
    1: [
      "Level 1 objective: Establish correct problem understanding.",
      "Include: core goal, who sends events, who receives events, and when indicator should start/stop.",
      "Depth target: conceptual only; no final architecture and no implementation sequence.",
      "Tone: clear and beginner-friendly, but technically accurate.",
    ].join(" "),
    2: [
      "Level 2 objective: Point to the right technical direction.",
      "Include: core communication model, transient vs durable data distinction, and routing scope (e.g., per conversation/session).",
      "Depth target: actionable design nudge with rationale on latency/scale efficiency.",
      "Do not provide end-to-end final design or complete pipeline.",
    ].join(" "),
    3: [
      "Level 3 objective: Provide concrete intermediate design guidance.",
      "Include: event lifecycle (start, update/keepalive, stop/timeout), state cleanup strategy, and at least two realistic edge cases.",
      "Depth target: specific enough to reduce ambiguity while still not revealing full answer.",
      "Call out at least one reliability concern and one UX correctness concern.",
    ].join(" "),
    4: [
      "Level 4 objective: Strong near-solution guidance without final blueprint.",
      "Include: key trade-offs, scalability bottleneck to watch, correctness invariants, and operational safeguards.",
      "Depth target: advanced and almost-solution-level, but must stop short of complete architecture/spec.",
      "No full final answer, no full component list with exact wiring, no full sequence diagram.",
    ].join(" "),
  };

  const system =
    "You are an expert systems-design mentor generating exactly ONE progressive hint for a single challenge. " +
    "Primary requirement: maximize correctness and relevance to the given challenge details. " +
    "Use the private reference solution only as calibration for technical accuracy; never disclose it directly. " +
    "Do not invent constraints, components, or assumptions not justified by provided context. " +
    "Do not output full solution, full architecture, full algorithm, full pseudocode, or implementation-ready blueprint. " +
    "Make the hint insight-dense: concrete, specific, and technically meaningful. " +
    "Avoid generic coaching language and avoid paraphrasing the challenge statement. " +
    "Avoid reusing phrasing from previously revealed hints. " +
    "Output format must be strict JSON only with exactly this shape: {\"level\": number, \"text\": string}.";

  const buildUserPrompt = (extra = "") =>
    `Target hint level: ${safeLevel}\n` +
    `Level-specific instruction: ${levelPromptByLevel[safeLevel]}\n` +
    "Quality bar: The hint should immediately help a serious candidate make correct design decisions for this exact problem.\n" +
    "Style rules: 3-6 sentences, no bullet list, no filler, no motivational fluff, no direct restatement of problem paragraph.\n" +
    `Challenge title: ${safeTitle}\n` +
    (shortDesc ? `Visible description for students:\n${shortDesc}\n\n` : "") +
    (solutionSummary
      ? `Private reference solution summary (DO NOT reveal directly, use only to calibrate hints):\n${solutionSummary}\n\n`
      : "") +
    (previousBlock ? `Already revealed hints:\n${previousBlock}\n\n` : "") +
    (extra ? `${extra}\n\n` : "") +
    "Return strict JSON with EXACT shape: { \"level\": number, \"text\": string } and nothing else.";

  const candidates = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const raw = await callChatModel(env, {
      system,
      messages: [{
        role: "user",
        content: buildUserPrompt(
          attempt === 0
            ? ""
            : "Rewrite with significantly higher technical depth and specificity. Make it clearly different from previous hints, include concrete decision guidance, and avoid quoting challenge text."
        ),
      }],
      maxTokens: 420,
      temperature: attempt === 0 ? 0.25 : 0.12,
      modelOverride: HINT_MODEL,
    });

    const text = extractAiHintCandidate(raw);
    if (!text) continue;
    candidates.push(text);

    const tooSimilarToPrevious = previousHints.some((h) => jaccardSimilarity(text, h) > 0.6);
    const lowQuality = isLowQualityHint(text, shortDesc);

    if (!tooSimilarToPrevious && !lowQuality) {
      return {
        level: safeLevel,
        text,
      };
    }
  }

  const bestAvailable = candidates.find((text) => !isLowQualityHint(text, shortDesc)) || candidates[0] || "";
  if (bestAvailable) {
    return {
      level: safeLevel,
      text: bestAvailable,
    };
  }

  const rescueRaw = await callChatModel(env, {
    system,
    messages: [{
      role: "user",
      content:
        `Target hint level: ${safeLevel}\n` +
        `Challenge title: ${safeTitle}\n` +
        (shortDesc ? `Visible description:\n${shortDesc}\n\n` : "") +
        (previousBlock ? `Already revealed hints:\n${previousBlock}\n\n` : "") +
        "Write one specific hint in 3-5 sentences. Keep it practical and technically useful. Return strict JSON: { \"level\": number, \"text\": string }.",
    }],
    maxTokens: 420,
    temperature: 0.18,
    modelOverride: HINT_MODEL,
  });

  const rescueText = extractAiHintCandidate(rescueRaw);
  if (rescueText) {
    return {
      level: safeLevel,
      text: rescueText,
    };
  }

  throw new Error(`AI hint generation failed quality checks for level ${safeLevel}`);
}

export async function generateSubmissionFeedback(env, { challenge, solutionText }) {
  const safeTitle = challenge?.title || "Untitled Challenge";
  const shortDesc = (challenge?.description || "").slice(0, 800);
  const solutionSummary = (challenge?.answer_description || "").slice(0, 1400);
  const trimmedSolution = (solutionText || "").slice(0, 4000);

  if (!trimmedSolution) return "Thanks for submitting!";

  const system =
    "You are an encouraging code reviewer for student challenge submissions. " +
    "Give SHORT, concrete feedback (3-6 bullet-style sentences). " +
    "Highlight strengths, point out 1-2 main issues or risks, and suggest the next improvement step. " +
    "Do NOT write full code and do NOT reveal an exact reference solution.";

  const user =
    `Challenge: ${safeTitle}\n` +
    (shortDesc ? `Description (what the student sees):\n${shortDesc}\n\n` : "") +
    (solutionSummary
      ? `Private reference solution summary (for your eyes only, do NOT reveal directly):\n${solutionSummary}\n\n`
      : "") +
    `Student submission (may be partial, messy, or in prose):\n${trimmedSolution}\n\n` +
    "Respond with a short paragraph or a few short lines of feedback. Do not mention that you saw a reference solution.";

  const reply = await callChatModel(env, {
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 500,
    temperature: 0.6,
  });

  return reply || "Thanks for submitting! Focus on clarifying your approach, handling edge cases, and checking the complexity of your solution.";
}
