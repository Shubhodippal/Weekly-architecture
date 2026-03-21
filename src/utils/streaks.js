function toDayMs(dayStr) {
  return new Date(`${dayStr}T00:00:00Z`).getTime();
}

function normalizeDay(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length >= 10) return str.slice(0, 10);
  return null;
}

export function computeStreakStats(dateValues = []) {
  const uniqueDays = [...new Set(dateValues.map(normalizeDay).filter(Boolean))]
    .sort((a, b) => (a < b ? 1 : -1));

  if (!uniqueDays.length) {
    return { currentStreak: 0, bestStreak: 0, lastActiveDate: null };
  }

  let currentStreak = 1;
  for (let i = 1; i < uniqueDays.length; i += 1) {
    const prev = toDayMs(uniqueDays[i - 1]);
    const next = toDayMs(uniqueDays[i]);
    const diffDays = Math.round((prev - next) / 86400000);
    if (diffDays === 1) currentStreak += 1;
    else break;
  }

  let bestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i += 1) {
    const prev = toDayMs(uniqueDays[i - 1]);
    const next = toDayMs(uniqueDays[i]);
    const diffDays = Math.round((prev - next) / 86400000);
    if (diffDays === 1) {
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 1;
    }
  }

  return {
    currentStreak,
    bestStreak,
    lastActiveDate: uniqueDays[0],
  };
}
