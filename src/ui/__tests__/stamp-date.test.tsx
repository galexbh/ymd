import "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatStampDate } from "../format";
import { Stamp } from "../Stamp";

const NBSP = " ";

describe("formatStampDate", () => {
  it("prints a two-digit day, an upper-case month without dots and the year", () => {
    const d = new Date(2026, 9, 9, 12);
    expect(formatStampDate(d, "en")).toBe(`09${NBSP}OCT${NBSP}2026`);
    expect(formatStampDate(d, "es")).toBe(`09${NBSP}OCT${NBSP}2026`);
    expect(formatStampDate(new Date(2026, 0, 5, 12), "es")).toBe(`05${NBSP}ENE${NBSP}2026`);
    expect(formatStampDate("nope", "es")).toBe("—");
  });
});

describe("Stamp with a filing date", () => {
  it("inks the date inside the impression as a <time>", () => {
    const { container } = render(
      <Stamp stage="done" date="09 OCT 2026" dateTime="2026-10-09T15:00:00Z" />,
    );
    const time = screen.getByText("09 OCT 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-10-09T15:00:00Z");
    expect(container.firstElementChild).toHaveTextContent("Archivado09 OCT 2026");
  });

  it("outlined stamps sit square with crisp rules; only ARCHIVADO tilts", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/Stamp.module.css"), "utf8");
    expect(css).not.toMatch(/mask-image/);
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)];
    const tilted = rules.filter(([, , body]) => /transform:\s*rotate/.test(body));
    expect(tilted.map(([, sel]) => sel.trim())).toEqual([".done"]);
    const rotVars = rules.filter(([, , body]) => /--stamp-rot:\s*-?[1-9.]/.test(body));
    expect(rotVars.map(([, sel]) => sel.trim())).toEqual([".done"]);
  });
});
