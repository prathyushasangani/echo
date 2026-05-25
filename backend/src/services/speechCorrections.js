const PHRASE_REPLACEMENTS = [
  [/\bsuper\s+bass\b/gi, 'supabase'],
  [/\bsupa\s+base\b/gi, 'supabase'],
  [/\bsuperbase\b/gi, 'supabase'],
  [/\bsoopa\s+base\b/gi, 'supabase'],
  [/\badent\b/gi, 'agent'],
  [/\ba\s+gent\b/gi, 'agent'],
  [/\bfire\s+base\b/gi, 'firebase'],
  [/\bdata\s+base\b/gi, 'database'],
  [/\blog\s*in\b/gi, 'login'],
  [/\bsign\s*in\b/gi, 'signin'],
  [/\bsign\s*up\b/gi, 'signup']
];

const COMMON_WORDS = new Map([
  ['agent', ['adent', 'agens', 'ajent']],
  ['supabase', ['superbass', 'superbas', 'suoerbase', 'suoer bass']],
  ['firebase', ['firebass', 'firebas']],
  ['database', ['databse', 'databae', 'databass']]
]);

export function normalizeRecognizedSpeech(input) {
  let normalized = String(input || '');
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .split(/\b/)
    .map((token) => correctWord(token))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function correctWord(token) {
  if (!/^[a-z]+$/i.test(token)) return token;
  const lower = token.toLowerCase();

  for (const [target, variants] of COMMON_WORDS) {
    if (variants.includes(lower) || isClose(lower, target)) {
      return preserveCase(token, target);
    }
  }

  return token;
}

function isClose(value, target) {
  if (Math.abs(value.length - target.length) > 2) return false;
  return levenshtein(value, target) <= 2;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return dp[a.length][b.length];
}

function preserveCase(original, replacement) {
  return original[0] === original[0]?.toUpperCase()
    ? `${replacement[0].toUpperCase()}${replacement.slice(1)}`
    : replacement;
}
