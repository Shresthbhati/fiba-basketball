import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthForm } from "../lib/auth-form";
import * as apiModule from "../lib/api";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

describe("AuthForm with Two-Factor Authentication (TOTP)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles normal login when TOTP is not required", async () => {
    const apiSpy = vi.spyOn(apiModule, "api").mockResolvedValueOnce({
      id: "u1",
      email: "player@example.com",
      displayName: "Player",
      isMinor: false,
      emailVerified: true,
      totpEnabled: false,
    });

    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith("/auth/login", {
        method: "POST",
        body: { email: "player@example.com", password: "password123" },
      });
      expect(push).toHaveBeenCalledWith("/pickup");
    });
  });

  it("transitions to TOTP challenge step when login response indicates requiresTotp", async () => {
    const apiSpy = vi.spyOn(apiModule, "api")
      .mockResolvedValueOnce({
        requiresTotp: true,
        challengeToken: "test-challenge-token-123",
      })
      .mockResolvedValueOnce({
        id: "u1",
        email: "admin@example.com",
        displayName: "Admin",
        isMinor: false,
        emailVerified: true,
        totpEnabled: true,
      });

    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "adminPass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    // Expect TOTP challenge view to appear
    await waitFor(() => {
      expect(screen.getByText("Two-Factor Authentication")).toBeDefined();
      expect(screen.getByLabelText(/Authentication code/i)).toBeDefined();
    });

    // Enter 6-digit TOTP code and submit
    fireEvent.change(screen.getByLabelText(/Authentication code/i), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign in" }));

    await waitFor(() => {
      expect(apiSpy).toHaveBeenLastCalledWith("/auth/totp/challenge", {
        method: "POST",
        body: { challengeToken: "test-challenge-token-123", code: "654321" },
      });
      expect(push).toHaveBeenCalledWith("/pickup");
    });
  });
});
