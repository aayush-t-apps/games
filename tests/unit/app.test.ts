// App-owned: tests for this app's own routes (src/worker/app.ts).
import { describe, expect, it } from "vitest";
import { app, type Env } from "../../src/worker/app";

const env: Env = { APP_ID: "games", APP_ENV: "test", GIT_SHA: "abc1234" };

describe("app routes", () => {
  it("serves /api/info", async () => {
    const res = await app.request("/api/info", {}, env);
    expect(await res.json()).toEqual({ app: "games", env: "test" });
  });
});
