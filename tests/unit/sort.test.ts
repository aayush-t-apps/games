// The admin tables' sort order (AC8.7): numbers as numbers, text by the reader's language, both
// ways, and equal rows keep their order. The buttons are covered by tests/e2e/online.spec.ts.
import { describe, expect, it } from "vitest";
import { compare, order } from "../../site/admin/sort.js";

describe("sorting a table", () => {
  it("compares numbers as numbers and text without case", () => {
    expect(compare("9", "10")).toBeLessThan(0);
    expect(compare("ludo", "Memory")).toBeLessThan(0);
    expect(compare("Room 2", "Room 10")).toBeLessThan(0);
    expect(compare("", "1")).toBeLessThan(0);
  });

  it("orders rows by a column, up or down, keeping equal rows in place", () => {
    const rows = [
      ["Ludo", "3"],
      ["Memory", "10"],
      ["Go Fish", "3"],
    ];
    const names = (sorted: string[][]) => sorted.map((r) => r[0]);
    expect(names(order(rows, 1, 1))).toEqual(["Ludo", "Go Fish", "Memory"]);
    expect(names(order(rows, 1, -1))).toEqual(["Memory", "Ludo", "Go Fish"]);
    expect(names(order(rows, 0, 1))).toEqual(["Go Fish", "Ludo", "Memory"]);
  });
});
