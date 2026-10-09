import "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressDeterminate } from "../LedgerSpan";

const inkOf = (bar: HTMLElement) => bar.firstElementChild as HTMLElement;

describe("ProgressDeterminate ink", () => {
  it.each([
    [0.25, 25],
    [0.5, 50],
    [2 / 3, 66.667],
    [1, 100],
  ])("draws exactly the fraction %s", (f, pct) => {
    render(
      <ProgressDeterminate label="Descargando ffmpeg" value={f * 92_000_000} max={92_000_000} />,
    );
    const bar = screen.getByRole("progressbar", { name: "Descargando ffmpeg" });
    expect(Number.parseFloat(inkOf(bar).style.width)).toBeCloseTo(pct, 2);
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeCloseTo(pct, 0);
  });

  it("follows every update without lagging behind the figures", () => {
    const { rerender } = render(<ProgressDeterminate label="x" value={10} max={40} />);
    for (const v of [20, 30, 40]) {
      rerender(<ProgressDeterminate label="x" value={v} max={40} />);
      expect(inkOf(screen.getByRole("progressbar")).style.width).toBe(`${(v / 40) * 100}%`);
    }
  });

  it("reduced motion removes transitions instead of shrinking them to 0.01ms", () => {
    // a 0.01ms transition still runs on the document timeline; a paused timeline froze the ink
    const css = readFileSync(join(process.cwd(), "src/styles/base.css"), "utf8");
    const block = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(block).toMatch(/transition-duration:\s*0s\s*!important/);
    expect(block).not.toMatch(/transition-duration:\s*0\.01ms/);
  });
});
