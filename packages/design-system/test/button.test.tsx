import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/components/Button";

describe("Button", () => {
  it("renders with children and responds to click", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    const btn = screen.getByRole("button", { name: "Submit" });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("handles loading state by disabling button and displaying spinner", () => {
    const handleClick = vi.fn();
    render(
      <Button loading onClick={handleClick}>
        Save
      </Button>
    );

    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();

    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders different variants and sizes", () => {
    const { rerender } = render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();

    rerender(<Button variant="ghost" size="lg">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" })).toBeTruthy();
  });
});
