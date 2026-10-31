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

/** A member invites friends from a game's Setup: the name is asked there, where others see it. */
async function invite(page: Page, nick: string, game: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Play ${game}` }).click();
  await page.getByRole("button", { name: "Invite friends" }).click();
  await page.getByLabel("Your name").fill(nick);
  await page.getByRole("button", { name: "Start the room" }).click();
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
  await invite(desk, "Ana", "Four in a Row");
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

test("the owner taps Leave: the seat opens and the guest gets the owner's controls (AC5.5)", async ({
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== "desktop", "one run: the test opens a desktop and a phone");
  test.setTimeout(60_000);
  const desk = await (
    await browser.newContext({ ...devices["Desktop Chrome"], baseURL })
  ).newPage();
  const phone = await (await browser.newContext({ ...devices["Pixel 7"], baseURL })).newPage();
  await invite(desk, "Ana", "Four in a Row");
  const code = (await desk.locator(".room-code").textContent())?.trim() ?? "";
  // The guest types the code on the hub this time.
  await phone.goto("/");
  await phone.getByLabel("Room code").fill(code.toLowerCase());
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await phone.getByLabel("Your nickname (1 to 16 letters)").fill("Sam");
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone.getByText("Waiting for Ana to start.")).toBeVisible();
  await expect(phone.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);

  desk.once("dialog", (d) => d.accept());
  await desk.getByRole("button", { name: "Leave the room" }).click();
  await expect(desk.getByRole("heading", { name: /^Pick a game/ })).toBeVisible();

  // Sam owns the room now: the controls, the owner tag, and Ana's seat open.
  await expect(phone.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await expect(phone.locator(".seat-row", { hasText: "Sam" }).locator(".tag.owner")).toBeVisible();
  await expect(phone.locator(".seat-row").first()).toContainText("Waiting for a player");
  await accessible(phone);
  await desk.context().close();
  await phone.context().close();
});

test("a guest gets Join and Sign in; a member gets Invite friends and Sign out (AC5.1, AC10.2)", async ({
  page,
}) => {
  // A signed-out visitor: Access answers the member call with its redirect.
  await page.route("**/api/member/me", (route) =>
    route.fulfill({ status: 302, headers: { location: "https://team.example/login" } }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Room code")).toBeVisible();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator("#join-status")).toHaveText(
    "A room code is 6 letters and digits, like K7M2QX.",
  );
  // The top bar says who plays here; Settings says how to sign in.
  await expect(page.locator(".me-tag")).toHaveText("Guest");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: "Sign in to invite friends" })).toHaveAttribute(
    "href",
    "/member",
  );
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play Ludo" }).click();
  await expect(page.getByRole("button", { name: "Invite friends" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in to invite friends" })).toBeVisible();

  // The local developer is a member: a reload keeps Setup, which now has Invite friends, and
  // Settings has Sign out.
  await page.unroute("**/api/member/me");
  await page.reload();
  await expect(page.locator(".me-tag")).toHaveText("Member");
  await expect(page.getByRole("heading", { level: 1, name: "Ludo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite friends" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: "Sign out" })).toHaveAttribute(
    "href",
    "/cdn-cgi/access/logout",
  );
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
  await expect(page.getByText("Signed in as dev@localhost")).toBeVisible();

  // A column head sorts its table, then the other way (AC8.7).
  const size = page.getByRole("columnheader", { name: "Size" });
  await size.getByRole("button").click();
  await expect(size).toHaveAttribute("aria-sort", "ascending");
  const firstGame = page.locator(".table-wrap").first().locator("tbody tr th").first();
  await expect(firstGame).toHaveText("Memory");
  await size.getByRole("button").click();
  await expect(size).toHaveAttribute("aria-sort", "descending");
  await expect(firstGame).toHaveText("Ludo");

  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByRole("button", { name: "Move Ludo up" })).toBeVisible();
  await accessible(page);
  await page.getByRole("tab", { name: "Rooms" }).click();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  await accessible(page);
  await page.getByRole("tab", { name: "Scores" }).click();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
  // Restore (AC8.8): the time field and the button; local workerd has no point-in-time
  // recovery, so the restore itself is checked only through the API's unit tests.
  await expect(page.getByLabel("Restore to (this device's time)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore…" })).toBeVisible();
  await accessible(page);
  // Arrow keys move between the tabs.
  await page.getByRole("tab", { name: "Scores" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Rooms" })).toHaveAttribute("aria-selected", "true");
});
