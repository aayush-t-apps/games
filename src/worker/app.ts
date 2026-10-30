// App-owned: add this app's routes here. Platform behaviour (/health, logging, request ids,
// /.well-known/shipify.json, asset fallback) comes from src/shared/platform.ts.
// Games has no routes of its own: every game runs in the browser from the files in site/.
import { createApp, type PlatformEnv } from "../shared/platform";

export interface Env extends PlatformEnv {}

export const app = createApp<Env>();
