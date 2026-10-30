// The Hub (change 0002, 0003): one object, `HUB.getByName("hub")`, with the catalogue switches,
// the live rooms and the matches in its SQLite. The queries are in ../hub-sql.ts.
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../app";
import type { CatalogRow } from "../checks";
import * as q from "../hub-sql";
import type { MatchRecord } from "../room-logic";

export class Hub extends DurableObject<Env> {
  private readonly sql: q.Sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = (query, ...bindings) =>
      ctx.storage.sql.exec(query, ...bindings).toArray() as q.Row[];
    q.migrate(this.sql);
  }

  catalog(): CatalogRow[] {
    return q.catalog(this.sql);
  }

  setCatalog(rows: CatalogRow[]): void {
    q.setCatalog(this.sql, rows);
  }

  allowRoom(r: { code: string; game: string; member: string; expires: number }): q.Allow {
    return q.allowRoom(this.sql, { ...r, now: Date.now() });
  }

  unlist(code: string): void {
    q.unlist(this.sql, code);
  }

  liveRooms(): q.LiveRoom[] {
    return q.liveRooms(this.sql, Date.now());
  }

  record(match: MatchRecord): void {
    q.record(this.sql, match);
  }

  scores(game: string) {
    return q.scores(this.sql, game);
  }

  stats() {
    return q.stats(this.sql, Date.now());
  }

  export() {
    return q.exportAll(this.sql, Date.now());
  }
}
