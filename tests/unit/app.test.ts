// App-owned: tests for this app's own routes (src/worker/app.ts).
import { describe, expect, it } from "vitest";
import { app, type Env } from "../../src/worker/app";

const env: Env = { APP_ID: "games", APP_ENV: "test", GIT_SHA: "abc1234" };

describe("app routes", () => {
  it("keeps no server state: nothing answers under /api", async () => {
    const res = await app.request("/api/info", {}, env);
    expect(res.status).toBe(404);
  });

  it("answers /health", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
  });
});
