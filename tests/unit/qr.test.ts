// The room link's QR code (AC5.2). It was checked once against a QR decoder (jsQR) for versions
// 1 to 10 and all 8 masks; these tests keep the parts that make it decode.
import { describe, expect, it } from "vitest";
import { ecc, penalty, qrMatrix, qrSvg } from "../../site/lib/qr.js";

const LINK = "https://games.app.a69x.in/r/K7M2QX";

describe("QR codes", () => {
  it("make the standard's error correction (the 1-M HELLO WORLD example)", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(ecc(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("use the smallest version that fits: a room link is version 3 (29 modules)", () => {
    expect(qrMatrix("HELLO")).toHaveLength(21);
    expect(qrMatrix(LINK)).toHaveLength(29);
    expect(qrMatrix("z".repeat(200))).toHaveLength(57);
    expect(() => qrMatrix("z".repeat(300))).toThrow("Too long");
  });

  it("have the three finder patterns, the timing lines and the dark module", () => {
    const m = qrMatrix(LINK);
    const n = m.length;
    const finder = (x0: number, y0: number) =>
      Array.from({ length: 7 }, (_, y) =>
        Array.from({ length: 7 }, (_, x) => (m[y0 + y]?.[x0 + x] ? 1 : 0)).join(""),
      );
    const want = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
    expect(finder(0, 0)).toEqual(want);
    expect(finder(n - 7, 0)).toEqual(want);
    expect(finder(0, n - 7)).toEqual(want);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]?.[i]).toBe(i % 2 === 0);
      expect(m[i]?.[6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8]?.[8]).toBe(true);
  });

  it("pick the mask with the lowest penalty", () => {
    const flat = Array.from({ length: 21 }, () => new Array(21).fill(false));
    expect(penalty(flat)).toBeGreaterThan(penalty(qrMatrix("HELLO")));
  });

  it("draw as SVG with a quiet zone and a label", () => {
    const svg = qrSvg(LINK, "QR code for the room link");
    expect(svg).toMatch(/^<svg viewBox="0 0 37 37" role="img" aria-label="QR code for the room link"/);
    expect(svg).toContain('d="M4 4h1v1h-1z');
  });
});
