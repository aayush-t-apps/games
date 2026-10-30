// Seeded randomness for the rules (mulberry32). The generator's state is a 32-bit number kept in
// the game state as `rng`, so a match is the same for the same seed, and a snapshot carries it.

/** A 32-bit seed from a number or a string. */
export function seedOf(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The next number in [0, 1). It advances `holder.rng`. */
export function next(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number in [0, n). */
export function int(holder, n) {
  return Math.floor(next(holder) * n);
}

/** One item of a list. */
export function pick(holder, list) {
  return list[int(holder, list.length)];
}

/** A shuffled copy of a list (Fisher-Yates). */
export function shuffle(holder, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(holder, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A generator for a CPU seat's choice that leaves the state as it was: it starts from the state's
 * generator, the seat and the move count, so the same position always gives the same choice.
 */
export function fork(state, salt) {
  return { rng: seedOf(`${state.rng}:${state.moves ?? 0}:${salt}`) };
}
