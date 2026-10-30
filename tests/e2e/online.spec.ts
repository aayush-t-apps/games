// Online rooms end to end (change 0002, 0003): a desktop and a phone play Four in a Row through a
// room, and the score shows. Locally Access isn't set up, so the desktop is the developer member
// (ADR 0001); the phone joins by the room's link as a guest, with no sign-in.
import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

/** No serious accessibility problem on this screen (the same bar as smoke.spec.ts). */
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

const column = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Column ${n},`) });
const turn = (page: Page) => page.locator("#turn");

async function named(page: Page, nick: string) {
  await page.goto("/");
  await page.locator("#first-nick").fill(nick);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: `Pick a game, ${nick}` })).toBeVisible();
}

test("a desktop and a phone play Four in a Row online, and the score shows (AC5.2, AC6.1, AC6.2, AC7.1, AC7.2)", async ({
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "one run: the test opens a desktop and a phone itself",
  );
  test.setTimeout(90_000);
  const desk = await (
    await browser.newContext({ ...devices["Desktop Chrome"], baseURL })
  ).newPage();
  const phone = await (await browser.newContext({ ...devices["Pixel 7"], baseURL })).newPage();

  // The member starts a room.
  await named(desk, "Ana");
  await desk.getByRole("button", { name: "Play online: Four in a Row" }).click();
  await desk.getByRole("button", { name: "Start the room" }).click();
  const code = (await desk.locator(".room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  await expect(desk.locator(".qr svg")).toBeVisible();
  await expect(desk.locator(".room-link")).toHaveText(new RegExp(`/r/${code}$`));

  // The guest opens the link, types a nickname once, and gets the free seat.
  await phone.goto(`/r/${code}`);
  await expect(phone.getByLabel("Your nickname (1 to 16 letters)")).toBeVisible();
  await accessible(phone);
  await phone.getByLabel("Your nickname (1 to 16 letters)").fill("Sam");
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone.getByText("Waiting for Ana to start.")).toBeVisible();
  await expect(desk.locator(".seats")).toContainText("Sam");
  await accessible(desk);

  // Only the owner has the controls; the desktop hosts the match.
  await expect(phone.getByRole("button", { name: "Start" })).toHaveCount(0);
  await desk.getByRole("button", { name: "Start", exact: true }).click();
  await expect(turn(desk)).toHaveText("Your turn");
  await expect(turn(phone)).toHaveText("Ana's turn");
  await accessible(phone);

  // Ana drops in column 4, Sam in column 1: four in a column wins for Ana.
  for (let i = 0; i < 4; i++) {
    await expect(turn(desk)).toHaveText("Your turn");
    await column(desk, 4).click();
    if (i === 3) break;
    await expect(turn(phone)).toHaveText("Your turn");
    await column(phone, 1).click();
  }

  await expect(desk.getByRole("heading", { level: 1, name: "You won!" })).toBeVisible();
  await expect(phone.getByRole("heading", { level: 1, name: "Ana won" })).toBeVisible();
  await expect(phone.locator(".places li")).toHaveText(["1st Ana", "2nd Sam"]);

  // The Hub kept the match: the scores show it on the phone.
  await phone.getByRole("button", { name: "Scores" }).click();
  await expect(phone.getByRole("heading", { name: "Top players: Four in a Row" })).toBeVisible();
  await expect(phone.locator(".scores table")).toContainText("Ana");
  await expect(phone.locator(".scores .recent li").first()).toContainText("1st Ana; 2nd Sam");

  await desk.context().close();
  await phone.context().close();
});

test("a room's link that has ended says so (AC6.7)", async ({ page }) => {
  await page.goto("/r/ABCDEF");
  await expect(page.getByRole("heading", { name: "This room has ended" })).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the hub follows the admin's catalogue: a game turned off leaves it (AC8.2)", async ({
  page,
}) => {
  // The real catalogue is shared by every test running now, so this one answers it itself.
  // tests/unit/objects.test.ts turns a game off through the admin API on a Worker of its own.
  await page.route("**/api/catalog", (route) =>
    route.fulfill({
      json: { games: [{ game: "memory", enabled: false, featured: false, sort: 0 }], online: true },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Play Ludo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Memory" })).toHaveCount(0);
});

test("the admin page opens on the Overview, with its four tabs (AC8.1)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await accessible(page);
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByRole("button", { name: "Move Ludo up" })).toBeVisible();
  await accessible(page);
  await page.getByRole("tab", { name: "Scores" }).click();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
});
