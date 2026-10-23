import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "../src/components/Input";
import { Select } from "../src/components/Select";

describe("Input & Select", () => {
  it("renders Input with label, hint, and error linked via ARIA", () => {
    render(
      <Input
        label="Player Jersey"
        hint="Number between 0 and 99"
        error="Invalid number"
        required
      />
    );

    const input = screen.getByLabelText(/Player Jersey/);
    expect(input).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");

    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("Invalid number");

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(describedBy).toContain(error.id);
  });

  it("renders Select with option list and handles selection", () => {
    const options = [
      { value: "PG", label: "Point Guard" },
      { value: "SG", label: "Shooting Guard" },
    ];
    render(<Select label="Position" options={options} defaultValue="PG" />);

    const select = screen.getByLabelText("Position") as HTMLSelectElement;
    expect(select.value).toBe("PG");
    expect(screen.getByText("Point Guard")).toBeTruthy();
    expect(screen.getByText("Shooting Guard")).toBeTruthy();
  });
});
