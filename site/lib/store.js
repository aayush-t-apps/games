// What the app keeps, only in this browser: localStorage key `games.v1`. This is the only module
// that touches localStorage. Export and Import move the same shape, with `format: "games.v1"`.

export const KEY = "games.v1";
export const FORMAT = "games.v1";
export const RECENT = 20;
export const LEVELS = ["easy", "normal", "hard", "friends"];
export const THEMES = ["auto", "light", "dark", "contrast"];
const MAX_NICK = 24;

const newId = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

export function blank() {
  return {
    player: { id: newId(), nick: "Player", named: false },
    settings: { kid: false, theme: "auto", sound: true },
    scores: {},
    recent: [],
  };
}

/** A clean nickname: trimmed, one line, at most 24 characters; "Player" when empty. */
export function cleanNick(text) {
  const nick = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NICK);
  return nick || "Player";
}

const isCount = (n) => Number.isInteger(n) && n >= 0;
const isObject = (o) => o !== null && typeof o === "object" && !Array.isArray(o);

/** Why `data` isn't a games.v1 save, or null when it is. */
export function problem(data) {
  if (!isObject(data)) return "This file isn't a Games save.";
  if (data.format !== FORMAT) return "This file isn't a Games save (format games.v1).";
  const { player, settings, scores, recent } = data;
  if (!isObject(player) || typeof player.nick !== "string" || typeof player.id !== "string")
    return "The save has no player name.";
  if (
    !isObject(settings) ||
    typeof settings.kid !== "boolean" ||
    typeof settings.sound !== "boolean" ||
    !THEMES.includes(settings.theme)
  )
    return "The save's settings aren't readable.";
  if (!isObject(scores)) return "The save's scores aren't readable.";
  for (const byLevel of Object.values(scores)) {
    if (!isObject(byLevel)) return "The save's scores aren't readable.";
    for (const [level, score] of Object.entries(byLevel))
      if (
        !LEVELS.includes(level) ||
        !isObject(score) ||
        !isCount(score.played) ||
        !isCount(score.won) ||
        score.won > score.played
      )
        return "The save's scores aren't readable.";
  }
  if (!Array.isArray(recent) || recent.length > RECENT) return "The save's results aren't readable.";
  for (const r of recent)
    if (
      !isObject(r) ||
      typeof r.game !== "string" ||
      typeof r.won !== "boolean" ||
      !LEVELS.includes(r.level) ||
      typeof r.place !== "number" ||
      typeof r.at !== "string"
    )
      return "The save's results aren't readable.";
  return null;
}

/** Keep only the known fields, so nothing else comes in with an import. */
function tidy(data) {
  return {
    player: { id: data.player.id, nick: cleanNick(data.player.nick), named: true },
    settings: {
      kid: data.settings.kid,
      theme: data.settings.theme,
      sound: data.settings.sound,
    },
    scores: Object.fromEntries(
      Object.entries(data.scores).map(([game, byLevel]) => [
        game,
        Object.fromEntries(
          Object.entries(byLevel).map(([level, s]) => [level, { played: s.played, won: s.won }]),
        ),
      ]),
    ),
    recent: data.recent.map((r) => ({
      game: r.game,
      level: r.level,
      won: r.won,
      place: r.place,
      at: r.at,
    })),
  };
}

/**
 * The store. `storage` is localStorage; when it is missing or blocked (private mode), play still
 * works and `kept` is false, so Settings can say that scores aren't kept.
 */
export function createStore(storage = safeStorage()) {
  let data = blank();
  let kept = false;
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (!problem({ ...saved, format: FORMAT })) {
        data = tidy(saved);
        data.player.named = saved.player.named !== false;
      }
    }
    kept = Boolean(storage);
  } catch {
    kept = false;
  }

  function save() {
    try {
      storage?.setItem(KEY, JSON.stringify(data));
      kept = Boolean(storage);
    } catch {
      kept = false;
    }
    return kept;
  }

  return {
    get: () => data,
    get kept() {
      return kept;
    },
    /** First visit: no nickname chosen yet. */
    get firstVisit() {
      return !data.player.named;
    },
    setNick(text) {
      data.player = { ...data.player, nick: cleanNick(text), named: true };
      return save();
    },
    setSettings(patch) {
      data.settings = { ...data.settings, ...patch };
      return save();
    },
    /** Add a finished match: played and won per game and level, and the last 20 results. */
    record({ game, level, won, place, at }) {
      const byLevel = (data.scores[game] ??= {});
      const score = (byLevel[level] ??= { played: 0, won: 0 });
      score.played += 1;
      if (won) score.won += 1;
      data.recent = [{ game, level, won, place, at }, ...data.recent].slice(0, RECENT);
      return save();
    },
    /** Played and won for one game, over every level. */
    totals(game) {
      return Object.values(data.scores[game] ?? {}).reduce(
        (t, s) => ({ played: t.played + s.played, won: t.won + s.won }),
        { played: 0, won: 0 },
      );
    },
    exportText() {
      return JSON.stringify({ format: FORMAT, ...data }, null, 2);
    },
    /** Load an exported file. Returns null, or the reason it was refused (nothing changes). */
    importText(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return "This file isn't a Games save.";
      }
      const why = problem(parsed);
      if (why) return why;
      data = tidy(parsed);
      save();
      return null;
    },
  };
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Ask the browser to keep this site's data (AC4.4). Resolves to true when it will. */
export async function persist(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.persist) return false;
    if (await nav.storage.persisted?.()) return true;
    return await nav.storage.persist();
  } catch {
    return false;
  }
}
