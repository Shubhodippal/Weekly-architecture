import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges/:id/submissions
 * Admin-only: returns all submissions for the given challenge.
 */
export async function handleListSubmissions(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT s.id, u.name AS user_name, u.email AS user_email,
            s.solution_text, s.file_name, s.file_type,
            s.submitted_at, s.updated_at,
            s.grade, s.remark, s.points, s.evaluated_at,
            CASE WHEN s.file_key IS NOT NULL THEN 1 ELSE 0 END AS has_file
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = ?
     ORDER BY
       s.submitted_at DESC`
  ).bind(id).all();

  const plagiarismStats = buildPlagiarismStats(results || []);

  const submissions = (results || []).map((row) => {
    const stat = plagiarismStats.get(Number(row.id)) || {
      percent: null,
      withName: null,
      details: null,
    };
    return {
      ...row,
      plagiarism_percent: stat.percent,
      plagiarism_with: stat.withName,
      plagiarism_details: stat.details,
    };
  });

  return json({ success: true, submissions });
}

function buildPlagiarismStats(submissions) {
  const map = new Map();
  const prepared = submissions.map((submission) => {
    const normalized = normalizeText(submission.solution_text);
    const words = wordList(normalized);
    return {
      id: Number(submission.id),
      name: submission.user_name,
      words,
      uniqueWords: new Set(words),
      word3Grams: wordNGrams(words, 3),
      char5Grams: charNGramFreq(normalized, 5),
      normalized,
    };
  });

  for (const item of prepared) {
    let bestScore = 0;
    let bestWith = null;
    let bestDetails = null;

    for (const other of prepared) {
      if (item.id === other.id) continue;

      const scorePack = compositeSimilarity(item, other);
      const score = scorePack.finalScore;
      if (score > bestScore) {
        bestScore = score;
        bestWith = other.name;
        bestDetails = scorePack;
      }
    }

    const enoughText = item.words.length >= 18;

    map.set(item.id, {
      percent: enoughText ? Math.round(bestScore * 100) : null,
      withName: enoughText ? bestWith : null,
      details: enoughText && bestDetails
        ? {
            risk_level: scoreToRisk(Math.round(bestScore * 100)),
            compared_word_count: item.words.length,
            unique_word_jaccard: Math.round(bestDetails.uniqueWordJaccard * 100),
            phrase_overlap_3gram: Math.round(bestDetails.phrase3GramJaccard * 100),
            char_pattern_similarity: Math.round(bestDetails.char5GramCosine * 100),
            longest_common_run_words: bestDetails.longestRunWords,
            overlap_phrases: bestDetails.overlapPhrases,
          }
        : null,
    });
  }

  return map;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wordList(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function wordNGrams(words, n) {
  if (!Array.isArray(words) || words.length < n) return new Set();
  const set = new Set();
  for (let i = 0; i <= words.length - n; i += 1) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set;
}

function charNGramFreq(text, n) {
  const freq = new Map();
  const source = String(text || "").replace(/\s+/g, " ");
  if (!source || source.length < n) return freq;
  for (let i = 0; i <= source.length - n; i += 1) {
    const gram = source.slice(i, i + n);
    freq.set(gram, (freq.get(gram) || 0) + 1);
  }
  return freq;
}

function setJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersect = 0;
  for (const token of a) {
    if (b.has(token)) intersect += 1;
  }
  const union = a.size + b.size - intersect;
  return union > 0 ? intersect / union : 0;
}

function cosineFromFreqMaps(a, b) {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [, valA] of a) normA += valA * valA;
  for (const [, valB] of b) normB += valB * valB;
  for (const [gram, valA] of a) {
    const valB = b.get(gram);
    if (valB) dot += valA * valB;
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function longestCommonContiguousRun(wordsA, wordsB) {
  if (!wordsA.length || !wordsB.length) return 0;
  const dp = Array(wordsB.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= wordsA.length; i += 1) {
    for (let j = wordsB.length; j >= 1; j -= 1) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[j] = dp[j - 1] + 1;
        if (dp[j] > best) best = dp[j];
      } else {
        dp[j] = 0;
      }
    }
  }
  return best;
}

function topOverlapPhrases(a3, b3, limit = 3) {
  const phrases = [];
  for (const phrase of a3) {
    if (b3.has(phrase)) phrases.push(phrase);
  }
  return phrases.slice(0, limit);
}

function compositeSimilarity(a, b) {
  const uniqueWordJaccard = setJaccard(a.uniqueWords, b.uniqueWords);
  const phrase3GramJaccard = setJaccard(a.word3Grams, b.word3Grams);
  const char5GramCosine = cosineFromFreqMaps(a.char5Grams, b.char5Grams);
  const longestRunWords = longestCommonContiguousRun(a.words, b.words);

  const runNormalized = Math.min(1, longestRunWords / 12);

  const finalScore =
    uniqueWordJaccard * 0.30 +
    phrase3GramJaccard * 0.35 +
    char5GramCosine * 0.20 +
    runNormalized * 0.15;

  return {
    finalScore,
    uniqueWordJaccard,
    phrase3GramJaccard,
    char5GramCosine,
    longestRunWords,
    overlapPhrases: topOverlapPhrases(a.word3Grams, b.word3Grams),
  };
}

function scoreToRisk(percent) {
  if (percent >= 75) return "high";
  if (percent >= 50) return "medium";
  return "low";
}
