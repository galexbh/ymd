import "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INK_LOOPS, ThumbCell } from "../ThumbCell";

describe("ThumbCell ink loop", () => {
  it("draws an authored SVG stroke, varied by index", () => {
    const paths = [1, 2, 3, 4].map((seq) => {
      const { container } = render(
        <ThumbCell seq={seq} title="t" thumbnail={null} selected onSelectedChange={() => {}} />,
      );
      const path = container.querySelector("svg path")!;
      expect(path.closest("svg")).toHaveAttribute("aria-hidden", "true");
      return path.getAttribute("d");
    });
    expect(new Set(paths).size).toBe(INK_LOOPS.length);
    expect(paths[0]).toBe(paths[3]);
  });

  it("no longer fakes the loop with an asymmetric border-radius", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/ThumbCell.module.css"), "utf8");
    expect(css).not.toMatch(/border-radius:[^;]*\//);
    expect(css).not.toMatch(/\.cell::after/);
  });
});
