// The games end to end, on desktop and phone (plan task T6).
import { expect, type Page, test } from "@playwright/test";

const GAMES = [
  "Four in a Row",
  "Wild Jacks",
  "Sudoku",
  "Ludo",
  "Snakes and Ladders",
  "Crazy Eights",
  "Go Fish",
  "Memory",
  "Quiz Race",
  "Crossword",
  "Word Tiles",
  "Word Guess",
];

async function open(page: Page) {
  await page.goto("/");
  // No questions first: the games are right there.
  await expect(page.getByRole("heading", { name: "Pick a game" })).toBeVisible();
}

async function setup(page: Page, game: string) {
  await page.getByRole("button", { name: `Play ${game}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: game })).toBeVisible();
}

// Start loads the game's files the first time ("Getting …"): on a busy box that can take longer
// than an expect's 5 s, so wait for it to end before the game's own checks.
async function start(page: Page) {
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("p.loading")).toHaveCount(0, { timeout: 15_000 });
}

const turn = (page: Page) => page.locator("#turn");
const freeColumn = (page: Page) =>
  page.getByRole("button", { name: /^Column \d, \d free$/ }).first();

test("the hub lists the twelve games with their type, players and ages (AC1.1)", async ({
  page,
}) => {
  await open(page);
  const boxes = page.locator(".shelf > li");
  await expect(boxes.locator("h2")).toHaveText(GAMES);
  await expect(boxes.first()).toContainText("Board game. 2 players. Ages 5+.");
  await expect(boxes.nth(2)).toContainText("Puzzle. 1 player. Ages 8+.");
  await expect(boxes.nth(5)).toContainText("Cards. 2–6 players. Ages 6+.");
  // Every game has its picture on its box.
  await expect(boxes.locator(".lid svg.emblem > :first-child")).toHaveCount(GAMES.length);
});

test("Wild Jacks: a picked card's squares glow, a tap puts a chip there, and the CPU plays (change 0007)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Wild Jacks");
  await start(page);
  await expect(page.locator("#board .cl-cell")).toHaveCount(100);
  await expect(turn(page)).toHaveText("Your turn");
  // A card that isn't a jack: its open squares glow, and a tap on one plays it.
  const card = page.locator(".card-btn:not([aria-label*='jack']):not(.dead)").first();
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  const spot = page.locator(".cl-cell.spot").first();
  await expect(spot).toBeVisible();
  await spot.click();
  // The moves log keeps the line: the live region may say the CPU's move before it is read.
  await expect(
    page.locator("#log li").filter({ hasText: /^Player played .+ on row \d+, column \d+/ }),
  ).toHaveCount(1);
  await expect(page.locator(".cl-cell[aria-label*='Blue chip']")).toHaveCount(1);
  await expect(page.locator("#live")).toHaveText(/^CPU 1 (played|took|traded)/);
  await expect(turn(page)).toHaveText("Your turn");
});

test("Snakes and Ladders: roll two dice, the picks' squares glow, a pick moves the token (change 0008)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Snakes and Ladders");
  await start(page);
  await expect(turn(page)).toHaveText("Your turn");
  await page.getByRole("button", { name: "Roll the dice" }).click();
  // From the start every pick fits: one die, the other, or both added (one or two picks).
  const picks = page.locator(".sl-pick");
  await expect(picks.first()).toBeVisible();
  await expect(page.locator(".sl-spot")).toHaveCount(await picks.count());
  await picks.first().click();
  // The moves log keeps the line: the live region may say the CPU's move before it is read.
  await expect(
    page.locator("#log li").filter({ hasText: /^Player (moved|climbed|slid)/ }),
  ).toHaveCount(1);
  await expect(page.locator(".sl-piece").first()).not.toHaveAttribute("aria-label", /at the start/);
  await expect(page.locator("#live")).toHaveText(/^CPU 1 /);
  await expect(turn(page)).toHaveText("Your turn");
});

test("Word Tiles: tiles go on the board, the words and points show, Play sends them (change 0009)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Word Tiles");
  await page.getByLabel(/^Kid mode/).check();
  await start(page);
  await expect(page.locator("#board .wt-cell")).toHaveCount(225);
  await expect(turn(page)).toHaveText("Your turn");
  // Kid mode: the centre star glows, the only square a first word can cover.
  await expect(page.locator(".wt-cell.legal")).toHaveCount(1);
  await expect(page.locator(".wt-rack button")).toHaveCount(7);
  // A tile and a square off the centre: the reason shows, and Play waits.
  const firstTile = page.locator(".wt-rack button").first();
  await firstTile.click();
  await expect(firstTile).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^row 1, column 2:/ }).click();
  const letter = page.locator(".wt-letters button").first();
  if (await letter.isVisible()) await letter.click();
  await expect(page.locator(".wt-score")).toHaveText("The first word must cover the centre star.");
  await expect(page.locator(".wt-rack button")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Take back" }).click();
  await expect(page.locator(".wt-rack button")).toHaveCount(7);
  // The hint puts a word on the board (rarely, no word fits: it says swap, and we pass); Play
  // sends it, and the CPU plays.
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator("#msg")).toHaveText(/^(Try [A-Z]+ for \d+|Swap)/);
  if ((await page.locator(".wt-tile.new").count()) === 0)
    await page.getByRole("button", { name: "Pass" }).click();
  else {
    await expect(page.locator(".wt-score")).toHaveText(/^[A-Z]+(, [A-Z]+)*: \d+ points?$/);
    await page.getByRole("button", { name: /^Play [A-Z]+$/ }).click();
  }
  // The moves log keeps the player's line: the live region may say the CPU's move before it is read.
  const log = page.locator("#log li");
  await expect(log.filter({ hasText: /^Player (played [A-Z]+.* for \d+|passed)/ })).toHaveCount(1);
  await expect(page.locator("#live")).toHaveText(/^CPU 1 (played|swapped|passed)/);
  await expect(turn(page)).toHaveText("Your turn");
});

test("Word Guess: pick a topic, type a word, see its colours, and Hint shows a letter (change 0009)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Word Guess");
  await expect(page.getByRole("radio", { name: "Today's word" })).toBeChecked();
  await page.getByRole("radio", { name: "Places" }).check();
  await start(page);
  await expect(page.locator(".wg-topic")).toHaveText("Places: a word of five letters");
  await expect(page.locator(".wg-row")).toHaveCount(6);
  // Too short: it says so. Then the screen's keys and the device's keyboard both type.
  for (const k of ["s", "l"])
    await page.getByRole("button", { name: k.toUpperCase(), exact: true }).click();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator("#msg")).toHaveText("Type five letters, then Enter.");
  await page.keyboard.type("ate");
  await page.keyboard.press("Enter");
  await expect(page.locator("#live")).toHaveText(/^Player (tried|found) SLATE/);
  await expect(
    page.locator(".wg-row").first().locator(".wg-cell.g, .wg-cell.y, .wg-cell.n"),
  ).toHaveCount(5);
  // A word that isn't one: refused, with the reason.
  await page.keyboard.type("xqzzy");
  await page.keyboard.press("Enter");
  await expect(page.locator("#msg")).toHaveText("XQZZY isn't in the word list.");
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator("#live")).toHaveText(/^Player took a hint: letter \d is [A-Z]/);
});

test("the hub's filters show the games for that many players and that kind", async ({ page }) => {
  await open(page);
  const shown = page.locator(".shelf > li:not([hidden]) h2");
  await page.getByRole("button", { name: "Kind: Words" }).click();
  await expect(shown).toHaveText(["Crossword", "Word Tiles", "Word Guess"]);
  await page.getByRole("button", { name: "Players: 2" }).click();
  await expect(shown).toHaveText(["Word Tiles"]);
  await page.getByRole("button", { name: "Kind: Kids" }).click();
  await expect(shown).toHaveText([
    "Four in a Row",
    "Ludo",
    "Snakes and Ladders",
    "Go Fish",
    "Memory",
    "Quiz Race",
  ]);
  await expect(page.getByRole("button", { name: "Kind: Kids" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Players: 5–6" }).click();
  await expect(shown).toHaveText(["Go Fish"]);
  await page.getByRole("button", { name: "Kind: Puzzles" }).click();
  await expect(shown).toHaveCount(0);
  await page.getByRole("button", { name: "Show all games" }).click();
  await expect(shown).toHaveCount(GAMES.length);
});

test("Back goes one screen back, asks before it leaves a match, and stays in the app (AC10.1)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Four in a Row");
  await start(page);
  await expect(turn(page)).toHaveText("Your turn");
  // No: the match stays.
  page.once("dialog", (d) => d.dismiss());
  await page.goBack();
  await expect(turn(page)).toHaveText("Your turn");
  // Yes: back to Setup, then back to the hub.
  page.once("dialog", (d) => d.accept());
  await page.goBack();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Pick a game" })).toBeVisible();
  // Forward opens Setup again; Back to games goes back through history.
  await page.goForward();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  await expect(page.getByRole("heading", { name: "Pick a game" })).toBeVisible();
});

test("Sudoku: pick a difficulty, place a number, and Hint shows a right step (change 0006)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Sudoku");
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("radio", { name: "Expert" }).check();
  await expect(page.getByLabel(/^Kid mode/)).toHaveCount(0);
  await start(page);
  await expect(page.locator("#board [data-x]")).toHaveCount(81);
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator("#msg")).toHaveText(/^Try a \d in row \d, column \d\.$/);
  await expect(page.locator("#board .hint")).toHaveCount(1);
});

test("Crossword: today's puzzle shows its clue, and Hint gives a letter (change 0006)", async ({
  page,
}) => {
  await open(page);
  await setup(page, "Crossword");
  await expect(page.getByRole("radio", { name: "Today's puzzle" })).toBeChecked();
  await start(page);
  await expect(page.locator("#board [data-x]").first()).toBeVisible();
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator("#msg")).toHaveText(/Across|Down/);
});

test("Four in a Row plays to the end against the CPU and counts the score (AC1.2, AC4.2)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  await setup(page, "Four in a Row");
  // How to play is open on a game's first play, and closed once a match is done (AC4.5).
  const how = page.locator("details.how");
  await expect(how).toHaveAttribute("open");
  await expect(how.locator("li").first()).toHaveText("Tap a column to drop your disc into it.");
  await start(page);
  // A banner says whose turn it is, and a CPU shows that it is thinking (AC1.6, AC1.7).
  await expect(page.locator(".banner")).toHaveText("Your turn");
  await freeColumn(page).click();
  await expect(page.locator(".chip.thinking")).toContainText("CPU 1");
  const result = page.getByRole("heading", { level: 1, name: /won|draw/ });
  const yourTurn = turn(page).filter({ hasText: "Your turn" });
  // At most 21 moves are yours; the result screen replaces the match when it ends.
  for (let i = 0; i < 22; i++) {
    await expect(yourTurn.or(result)).toBeVisible({ timeout: 15_000 });
    if (await result.isVisible()) break;
    await freeColumn(page).click();
  }
  await expect(result).toBeVisible();
  await expect(page.locator(".places li")).toHaveCount(2);
  await page.getByRole("button", { name: "Choose another game" }).click();
  const row = page.locator(".scores tr", { hasText: "Four in a Row" });
  await expect(row.locator("td").first()).toHaveText("1");
  await setup(page, "Four in a Row");
  await expect(how).not.toHaveAttribute("open");
});

test("Go Fish pass-and-play covers the screen between players (AC2.1, AC2.2)", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await setup(page, "Go Fish");
  await page.getByLabel("You", { exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Person here" }).click();
  await page.getByLabel("Player 2").fill("Sam");
  await start(page);

  await expect(page.getByRole("dialog", { name: "Pass to Ana" })).toBeVisible();
  await expect(page.locator(".card-btn")).toHaveCount(0);
  await page.getByRole("button", { name: "I'm Ana: show my cards" }).click();
  await expect(turn(page)).toHaveText("Ana's turn");

  const toSam = page.getByRole("dialog", { name: "Pass to Sam" });
  for (let i = 0; i < 30 && !(await toSam.isVisible()); i++) {
    await page.locator(".card-btn").first().click();
    await page.waitForTimeout(150);
  }
  await expect(toSam).toBeVisible();
  await expect(page.locator(".card-btn")).toHaveCount(0);
  await page.getByRole("button", { name: "I'm Sam: show my cards" }).click();
  await expect(turn(page)).toHaveText("Sam's turn");
  await expect(page.locator(".card-btn").first()).toBeVisible();
});

test("a match plays by keyboard alone, and says each move (AC2.3)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard play is checked on desktop");
  await open(page);
  await setup(page, "Four in a Row");
  await start(page);
  await expect(turn(page)).toHaveText("Your turn");
  for (let i = 0; i < 10; i++) {
    const key = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.key);
    if (key?.startsWith("c")) break;
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "Column 1, 6 free" })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /^Column 4/ })).toBeFocused();
  await page.keyboard.press("Enter");
  // The moves log keeps the player's line: the live region may say the CPU's move before it is read.
  await expect(
    page.locator("#log li").filter({ hasText: /^Player dropped a disc in column 4$/ }),
  ).toHaveCount(1);
  await expect(page.locator("#live")).toHaveText(/^CPU 1 dropped a disc/);
  await expect(turn(page)).toHaveText("Your turn");
  await expect(page.locator("#board :focus")).toHaveCount(1);
});

test("plays offline after Download all (AC3.1, AC3.2)", async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r));
  });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Download all for offline" }).click();
  await expect(page.locator("#download-status")).toHaveText("All games ready offline");
  await page.getByRole("button", { name: "Done" }).click();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.locator(".shelf h2")).toHaveText(GAMES);
  await expect(page.getByText("Needs signal once").filter({ visible: true })).toHaveCount(0);
  const plays = page.getByRole("button", { name: /^Play / });
  await expect(plays).toHaveCount(GAMES.length);
  for (const play of await plays.all()) await expect(play).toBeEnabled();
  await setup(page, "Memory");
  await start(page);
  await page.getByRole("button", { name: "Card 1, face down" }).click();
  await expect(page.getByRole("button", { name: /^Card 1, (?!face down)/ })).toBeVisible();
  await context.setOffline(false);
});

test("kid mode highlights moves, gives a hint and takes a move back (AC4.1)", async ({ page }) => {
  await open(page);
  await setup(page, "Four in a Row");
  await page.getByLabel(/^Kid mode/).check();
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Easy" })).toBeChecked();
  await start(page);
  await expect(turn(page)).toHaveText("Your turn");
  await expect(page.locator(".col.legal")).toHaveCount(7);

  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator(".col.hint")).toHaveCount(1);
  await expect(page.locator("#msg")).toHaveText(/^Try column \d\.$/);

  await page.getByRole("button", { name: "Column 1, 6 free" }).click();
  await expect(page.locator("#live")).toHaveText(/^CPU 1 dropped a disc/);
  await expect(turn(page)).toHaveText("Your turn");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /6 free$/ })).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("Settings changes the name, kept on this device, with no Export or Import", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const nick = page.getByLabel("Your name");
  await nick.fill("Ana");
  await nick.press("Tab");
  await expect(page.getByRole("button", { name: /Export/ })).toHaveCount(0);
  await expect(page.getByLabel(/Import/)).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await setup(page, "Ludo");
  await expect(page.getByLabel("You", { exact: true })).toHaveValue("Ana");
});

test("the name typed on Setup is kept for next time", async ({ page }) => {
  await open(page);
  await setup(page, "Memory");
  await page.getByLabel("You", { exact: true }).fill("Sam");
  await start(page);
  await expect(page.locator("#board")).toBeVisible();
  // A reload isn't kept as a match: it opens that game's Setup (AC10.1).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Memory" })).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  await setup(page, "Ludo");
  await expect(page.getByLabel("You", { exact: true })).toHaveValue("Sam");
});

test("shows Install when the browser offers it (AC3.4)", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await expect(page.getByRole("button", { name: "Install", exact: true })).toBeVisible();
});

test.describe("on an iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  test("shows the Add to Home Screen card (AC3.4)", async ({ page }) => {
    await open(page);
    const card = page.getByRole("heading", { name: "Add Games to your Home Screen" });
    await expect(card).toBeVisible();
    await expect(page.getByText("Tap Share, then Add to Home Screen.")).toBeVisible();
  });
});

test("a resize changes the layout and keeps the match going (AC3.5)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "resizing is checked on desktop");
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page);
  await expect(page.locator("body")).toHaveAttribute("data-layout", "compact");
  await setup(page, "Four in a Row");
  await start(page);
  await page.getByRole("button", { name: "Column 1, 6 free" }).click();
  await expect(turn(page)).toHaveText("Your turn");
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(page.locator("body")).toHaveAttribute("data-layout", "wide");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("body")).toHaveAttribute("data-layout", "desk");
  await expect(page.getByRole("button", { name: "Column 1, 5 free" })).toBeVisible();
  await expect(page.locator(".side")).toBeVisible();
});
