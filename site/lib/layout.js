// The layout, chosen by the size of the window, not the device: compact (narrow portrait), wide
// (landscape and tablets) or desk (big screens, with a side panel). It sets `data-layout` on <body>
// and tells the match screen, which redraws; a rotation or a resize keeps the match going.

export function layoutFor(width, height) {
  if (width >= 1100 && height >= 600) return "desk";
  if (width >= 720 || width > height) return "wide";
  return "compact";
}

export function watchLayout(onChange) {
  let current = "";
  const update = () => {
    const next = layoutFor(window.innerWidth, window.innerHeight);
    if (next === current) return;
    current = next;
    document.body.dataset.layout = next;
    onChange(next);
  };
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  update();
  return () => current;
}
