// Small page helpers: making elements, the live region, the pass screen, sounds and vibration.

/** Make an element: el("button", {class: "x", onclick}, "Text", child). Text is set as text. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Say something through the ARIA live region (screen readers read it out). */
export function announce(text) {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  // A new text node each time, so the same words are read again.
  requestAnimationFrame(() => {
    live.textContent = text;
  });
}

/** Cover the screen until the named player taps; then resolve. */
export function passScreen(name) {
  return new Promise((resolve) => {
    const button = el("button", { class: "primary big", type: "button" }, `I'm ${name}: show my cards`);
    const cover = el(
      "div",
      { class: "pass", role: "dialog", "aria-modal": "true", "aria-labelledby": "pass-title" },
      el("div", { class: "pass-card" }, el("h2", { id: "pass-title" }, `Pass to ${name}`), el("p", {}, "Hand the device over. Only you look at your cards."), button),
    );
    button.addEventListener("click", () => {
      cover.remove();
      resolve();
    });
    document.body.append(cover);
    button.focus();
  });
}

let audio = null;
let soundOn = true;
export const setSound = (on) => {
  soundOn = on;
};

const TONES = {
  move: [[520, 0.05]],
  mine: [[660, 0.06]],
  bad: [
    [220, 0.12],
    [180, 0.12],
  ],
  win: [
    [523, 0.1],
    [659, 0.1],
    [784, 0.18],
  ],
  // A game's own sounds (its view's sound(move, note) names one).
  roll: [
    [880, 0.03],
    [620, 0.03],
    [990, 0.03],
    [700, 0.03],
    [540, 0.06],
  ],
  card: [
    [1200, 0.025],
    [800, 0.04],
  ],
  drop: [
    [700, 0.04],
    [350, 0.08],
  ],
  capture: [
    [392, 0.08],
    [262, 0.14],
  ],
  home: [
    [659, 0.08],
    [880, 0.12],
  ],
};

/** A short tone made in the browser (no sound files), and a tap of vibration where there is one. */
export function sound(kind) {
  if (kind !== "move" && navigator.vibrate) navigator.vibrate(kind === "bad" ? [30, 40, 30] : 15);
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    let t = audio.currentTime;
    for (const [freq, length] of TONES[kind] ?? []) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + length);
      t += length;
    }
  } catch {
    // No Web Audio here: play on in silence.
  }
}

/** "1st", "2nd", "3rd", "4th". */
export const ordinal = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** Put names into a rules note: "@0 played 7♥" becomes "Ana played 7♥". */
export const fillNames = (note, names) => note.replace(/@(\d)/g, (_, i) => names[Number(i)] ?? "Someone");
