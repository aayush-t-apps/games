// Keyboard over the board: one item holds the focus ring (a roving tabindex), the arrow keys move it
// to the nearest item in that direction, and Enter or Space plays it (items are buttons). Each game's
// view puts `data-x` and `data-y` on the items it draws; pointer, touch and pen are the buttons'
// own clicks. Moves are announced through the live region by the match screen.

const items = (box) => [...box.querySelectorAll("[data-x]")].filter((n) => !n.hidden);
const pos = (n) => [Number(n.dataset.x), Number(n.dataset.y)];
const DIRS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The nearest item from `from` in direction [dx, dy]. */
export function nearest(list, from, [dx, dy]) {
  const [fx, fy] = pos(from);
  let best = null;
  let bestCost = Infinity;
  for (const n of list) {
    if (n === from) continue;
    const [x, y] = pos(n);
    const along = (x - fx) * dx + (y - fy) * dy;
    if (along <= 0) continue;
    const across = Math.abs(dx ? y - fy : x - fx);
    const cost = along + across * 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = n;
    }
  }
  return best;
}

function focusOn(box, target) {
  for (const n of items(box)) n.tabIndex = n === target ? 0 : -1;
  target?.focus();
}

/**
 * Keep one tab stop in `box` and move it with the arrow keys. Call `refresh(box, key)` after each
 * draw: it puts the tab stop back on the item with that `data-key` (or the first wanted one).
 */
export function bindBoard(box) {
  box.addEventListener("keydown", (event) => {
    const dir = DIRS[event.key];
    if (!dir || !(event.target instanceof HTMLElement) || !event.target.dataset.x) return;
    const next = nearest(items(box), event.target, dir);
    if (next) {
      event.preventDefault();
      focusOn(box, next);
    }
  });
  box.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.x)
      for (const n of items(box)) n.tabIndex = n === event.target ? 0 : -1;
  });
}

/** After a redraw: one tab stop, on the item with `key`, else on a wanted item, else the first. */
export function refresh(box, key, refocus) {
  const list = items(box);
  if (!list.length) return;
  const target =
    list.find((n) => n.dataset.key === key) ?? list.find((n) => n.classList.contains("legal")) ?? list[0];
  for (const n of list) n.tabIndex = n === target ? 0 : -1;
  if (refocus) target.focus({ preventScroll: true });
}
