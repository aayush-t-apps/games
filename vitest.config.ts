import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// Unit tests cover logic: the Worker, shared code and src/web/lib. UI components are covered by
// Playwright in tests/e2e. The coverage floor is set by the platform and may only be raised.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Half the cores, never under two: on a small box the default leaves nothing for the
    // runner or the agent. The same cap Shipify's own config has.
    maxWorkers: Math.max(2, Math.floor(availableParallelism() / 2)),
    coverage: {
      provider: "v8",
      // Durable Objects run in workerd (tests/unit/support/worker.ts), where Node can't count them:
      // logic that needs branch tests goes in plain modules beside them.
      exclude: ["src/worker/index.ts", "src/shared/health.ts", "src/worker/objects/**"],
      include: [
        "src/worker/**/*.ts",
        "src/shared/**/*.ts",
        "src/web/lib/**/*.ts",
        // The game logic: pure modules with no DOM. The screens are covered by tests/e2e.
        "site/lib/{rng,deck,board,engine,store,qr}.js",
        "site/lib/net/*.js",
        "site/games/*/rules.js",
      ],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
