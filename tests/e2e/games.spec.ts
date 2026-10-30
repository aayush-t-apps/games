// The games end to end, on desktop and phone (plan task T6).
import { expect, type Page, test } from "@playwright/test";

const GAMES = ["Crazy Eights", "Go Fish", "Memory", "Ludo", "Four in a Row", "Quiz Race"];

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "Pick a game, Player" })).toBeVisible();
}

async function setup(page: Page, game: string) {
  await page.getByRole("button", { name: `Play ${game}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: game })).toBeVisible();
}

const turn = (page: Page) => page.locator("#turn");
const freeColumn = (page: Page) =>
  page.getByRole("button", { name: /^Column \d, \d free$/ }).first();

test("the hub lists the six games with their type, players and ages (AC1.1)", async ({ page }) => {
  await open(page);
  const boxes = page.locator(".shelf > li");
  await expect(boxes.locator("h2")).toHaveText(GAMES);
  await expect(boxes.first()).toContainText("Cards. 2–6 players. Ages 6+.");
  await expect(boxes.nth(2)).toContainText("Kids. 1–4 players. Ages 3+.");
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
  await page.getByRole("button", { name: "Start" }).click();
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
  await page.getByRole("button", { name: "Make it a person" }).click();
  await page.getByLabel("Player 2").fill("Sam");
  await page.getByRole("button", { name: "Start" }).click();

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
  await page.getByRole("button", { name: "Start" }).click();
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
  await expect(page.locator("#live")).toHaveText("Player dropped a disc in column 4");
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
  await page.getByRole("button", { name: "Download all for offline" }).click();
  await expect(page.locator("#download-status")).toHaveText("All games ready offline");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.locator(".shelf h2")).toHaveText(GAMES);
  await expect(page.getByText("Needs signal once").filter({ visible: true })).toHaveCount(0);
  const plays = page.getByRole("button", { name: /^Play / });
  await expect(plays).toHaveCount(6);
  for (const play of await plays.all()) await expect(play).toBeEnabled();
  await setup(page, "Memory");
  await page.getByRole("button", { name: "Start" }).click();
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
  await page.getByRole("button", { name: "Start" }).click();
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
  await expect(page.getByRole("heading", { name: "Pick a game, Ana" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pick a game, Ana" })).toBeVisible();
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
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Column 1, 6 free" }).click();
  await expect(turn(page)).toHaveText("Your turn");
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(page.locator("body")).toHaveAttribute("data-layout", "wide");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("body")).toHaveAttribute("data-layout", "desk");
  await expect(page.getByRole("button", { name: "Column 1, 5 free" })).toBeVisible();
  await expect(page.locator(".side")).toBeVisible();
});
