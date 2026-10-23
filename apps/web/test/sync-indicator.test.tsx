import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncIndicator } from "../lib/sync-indicator";

describe("SyncIndicator", () => {
  it("renders an accessible status", () => {
    render(<SyncIndicator />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
