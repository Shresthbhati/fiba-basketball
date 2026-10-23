import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/components/Button";
import { Dialog } from "../src/components/Dialog";

describe("Dialog", () => {
  it("renders modal dialog when open and hides when false", () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Dialog
        open={false}
        onClose={handleClose}
        title="Schedule Delay"
        description="Downstream matches will be shifted"
      >
        <p>Dialog body content</p>
      </Dialog>
    );

    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <Dialog
        open={true}
        onClose={handleClose}
        title="Schedule Delay"
        description="Downstream matches will be shifted"
      >
        <p>Dialog body content</p>
      </Dialog>
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Schedule Delay")).toBeTruthy();
    expect(screen.getByText("Downstream matches will be shifted")).toBeTruthy();
    expect(screen.getByText("Dialog body content")).toBeTruthy();
  });

  it("closes when close button is clicked or Escape key pressed", () => {
    const handleClose = vi.fn();
    render(
      <Dialog
        open={true}
        onClose={handleClose}
        title="Forfeit Match"
        actions={<Button onClick={handleClose}>Confirm</Button>}
      >
        <p>Are you sure?</p>
      </Dialog>
    );

    const closeBtn = screen.getByLabelText("Close dialog");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
