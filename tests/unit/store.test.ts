import { describe, expect, it } from "vitest";
import { cleanNick, createStore, KEY, persist, problem, RECENT } from "../../site/lib/store.js";

function memory() {
  const map = new Map<string, string>();
  const storage = {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  return storage as typeof storage & Storage;
}

const blocked = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
} as unknown as Storage;

const result = (won: boolean, game = "ludo", level = "easy") => ({
  game,
  level,
  won,
  place: won ? 1 : 2,
  at: "2026-10-30T12:00:00.000Z",
});

describe("store", () => {
  it("starts blank on a first visit, with Player as the name", () => {
    const store = createStore(memory());
    expect(store.firstVisit).toBe(true);
    expect(store.get().player.nick).toBe("Player");
    expect(store.get().player.id).toMatch(/^[0-9a-f]{16}$/);
    expect(store.get().settings).toEqual({ kid: false, theme: "auto", sound: true });
  });

  it("keeps the name and settings in localStorage key games.v1", () => {
    const storage = memory();
    const store = createStore(storage);
    store.setNick("  Ana \n Lee  ");
    store.setSettings({ kid: true, theme: "dark" });
    const again = createStore(storage);
    expect(again.firstVisit).toBe(false);
    expect(again.get().player.nick).toBe("Ana Lee");
    expect(again.get().settings).toEqual({ kid: true, theme: "dark", sound: true });
    expect(storage.map.has(KEY)).toBe(true);
  });

  it("adds each match to the scores per game and level, and keeps the last 20 (AC4.2)", () => {
    const storage = memory();
    const store = createStore(storage);
    store.record(result(true));
    store.record(result(false));
    store.record(result(true, "ludo", "hard"));
    for (let i = 0; i < 25; i++) store.record(result(false, "memory", "friends"));
    const data = createStore(storage).get();
    expect((data.scores as Record<string, unknown>).ludo).toEqual({
      easy: { played: 2, won: 1 },
      hard: { played: 1, won: 1 },
    });
    expect(store.totals("ludo")).toEqual({ played: 3, won: 2 });
    expect(store.totals("go-fish")).toEqual({ played: 0, won: 0 });
    expect(data.recent).toHaveLength(RECENT);
    expect(data.recent[0]).toEqual(result(false, "memory", "friends"));
  });

  it("plays on when storage is blocked, and says scores aren't kept", () => {
    const store = createStore(blocked);
    expect(store.kept).toBe(false);
    expect(store.record(result(true))).toBe(false);
    expect(store.totals("ludo").played).toBe(1);
    expect(createStore(null).kept).toBe(false);
  });

  it("ignores a broken save and starts blank", () => {
    const storage = memory();
    storage.setItem(KEY, "{not json");
    expect(createStore(storage).firstVisit).toBe(true);
    storage.setItem(KEY, JSON.stringify({ player: 1 }));
    expect(createStore(storage).get().player.nick).toBe("Player");
  });

  it("reads back only data of the right shape; anything else starts blank", () => {
    const storage = memory();
    const store = createStore(storage);
    store.setNick("Ana");
    store.record(result(true));
    const good = { format: "games.v1", ...store.get() };
    expect(problem(good)).toBeNull();
    const cases: [unknown, string][] = [
      ["hello", "This isn't Games data."],
      [[1], "This isn't Games data."],
      [{ ...good, format: "other" }, "This isn't Games data (format games.v1)."],
      [{ ...good, player: {} }, "The save has no player name."],
      [
        { ...good, settings: { ...good.settings, theme: "pink" } },
        "The save's settings aren't readable.",
      ],
      [{ ...good, scores: [] }, "The save's scores aren't readable."],
      [{ ...good, scores: { ludo: 3 } }, "The save's scores aren't readable."],
      [
        { ...good, scores: { ludo: { easy: { played: 1, won: 2 } } } },
        "The save's scores aren't readable.",
      ],
      [{ ...good, recent: {} }, "The save's results aren't readable."],
      [{ ...good, recent: [{ game: "ludo" }] }, "The save's results aren't readable."],
    ];
    for (const [data, reason] of cases) expect(problem(data)).toBe(reason);
    // A broken score in storage: the store starts blank instead.
    storage.setItem(KEY, JSON.stringify({ ...good, scores: { ludo: 3 } }));
    expect(createStore(storage).firstVisit).toBe(true);
  });

  it("cleans names", () => {
    expect(cleanNick("")).toBe("Player");
    expect(cleanNick(undefined)).toBe("Player");
    expect(cleanNick("x".repeat(40))).toHaveLength(24);
  });
});

describe("persistent storage (AC4.4)", () => {
  it("asks the browser to keep the data", async () => {
    let asked = 0;
    const nav = {
      storage: {
        persisted: async () => false,
        persist: async () => {
          asked++;
          return true;
        },
      },
    };
    expect(await persist(nav)).toBe(true);
    expect(asked).toBe(1);
  });

  it("doesn't ask again when it's kept already, and copes without the API", async () => {
    const nav = {
      storage: {
        persisted: async () => true,
        persist: async () => {
          throw new Error("asked again");
        },
      },
    };
    expect(await persist(nav)).toBe(true);
    expect(await persist({})).toBe(false);
    expect(await persist({ storage: { persist: () => Promise.reject(new Error("no")) } })).toBe(
      false,
    );
  });
});
