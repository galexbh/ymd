import "./helpers";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Thumb } from "../Thumb";

describe("Thumb", () => {
  it("renders a lazy image", () => {
    const { container } = render(<Thumb src="data:image/png;base64,AA" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "");
  });

  it("falls back to a pencilled placeholder when the image fails", () => {
    const { container } = render(<Thumb src="data:image/png;base64,AA" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("Sin miniatura").length).toBeGreaterThan(0);
  });

  it("shows the placeholder without a source", () => {
    const { container } = render(<Thumb src={null} />);
    expect(container.firstElementChild).toHaveAttribute("data-broken", "true");
  });
});
