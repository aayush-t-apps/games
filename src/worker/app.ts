// App-owned: add this app's routes here. Platform behaviour (/health, logging, request ids,
// /.well-known/shipify.json, asset fallback) comes from src/shared/platform.ts.
import { createApp, type PlatformEnv } from "../shared/platform";

export interface Env extends PlatformEnv {}

export const app = createApp<Env>((a) => {
  a.get("/api/info", (c) => c.json({ app: c.env.APP_ID, env: c.env.APP_ENV }));
});
