const BLOCKED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "motherfucker",
  "slut",
  "whore",
];

function toWordPattern(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const profanityRegex = new RegExp(
  `\\b(${BLOCKED_WORDS.map(toWordPattern).join("|")})\\b`,
  "i"
);

export function hasProfanity(text) {
  return profanityRegex.test(String(text || ""));
}

export function profanityMessage() {
  return "Comment contains blocked language. Please keep discussions respectful.";
}
