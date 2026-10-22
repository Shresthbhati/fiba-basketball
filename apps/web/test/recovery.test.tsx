import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm, ResetPasswordForm, VerifyEmail } from "../lib/recovery-forms";
import { SiteNav } from "../lib/site-nav";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Handler = (url: string, method: string, body: unknown) => Response | Promise<Response>;
function mockFetch(h: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    h(url, init?.method ?? "GET", init?.body ? JSON.parse(String(init.body)) : undefined));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const problem = (status: number, title: string) => Response.json({ title }, { status });
const NEUTRAL = "If an account exists for that email, we've sent a link";

describe("ForgotPasswordForm", () => {
  it("shows the neutral message after submitting", async () => {
    const f = mockFetch(() => Response.json({ ok: true }, { status: 202 }));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("status")).textContent).toBe(NEUTRAL);
    expect(f).toHaveBeenCalledWith("/api/v1/auth/password-reset/request", expect.objectContaining({ method: "POST" }));
  });
  it("shows a friendly message when rate limited", async () => {
    mockFetch(() => problem(429, "Too Many Requests"));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many requests/);
  });
  it("shows an offline error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fail"); }));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not reach the server/);
  });
});

describe("ResetPasswordForm", () => {
  const fill = (a: string, b: string) => {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: a } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: b } });
    fireEvent.submit(screen.getByRole("button", { name: "Set new password" }).closest("form")!);
  };
  it("without a token shows the invalid-link state", () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.getByRole("alert").textContent).toMatch(/invalid or has expired/);
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toBeTruthy();
  });
  it("rejects short and mismatched passwords without calling the API", () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    render(<ResetPasswordForm token="t" />);
    fill("short", "short");
    expect(screen.getByRole("alert").textContent).toMatch(/at least 10/);
    fill("long-enough-pw", "different-pw-x");
    expect(screen.getByRole("alert").textContent).toMatch(/don't match/);
    expect(f).not.toHaveBeenCalled();
  });
  it("sends the token and password then links to login", async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    render(<ResetPasswordForm token="tok-123" />);
    fill("long-enough-pw", "long-enough-pw");
    expect((await screen.findByRole("status")).textContent).toMatch(/password has been changed/);
    expect(screen.getByRole("link", { name: /Log in/ }).getAttribute("href")).toBe("/login");
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body))).toEqual({ token: "tok-123", password: "long-enough-pw" });
  });
  it("shows the invalid/expired state when the API rejects the token", async () => {
    mockFetch(() => problem(400, "This link is invalid or has expired"));
    render(<ResetPasswordForm token="used" />);
    fill("long-enough-pw", "long-enough-pw");
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid or has expired/);
  });
  it("keeps the form and shows an error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("x"); }));
    render(<ResetPasswordForm token="t" />);
    fill("long-enough-pw", "long-enough-pw");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not reach the server/);
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });
});

describe("VerifyEmail", () => {
  it("shows loading then success, posting once even under StrictMode", async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    render(<StrictMode><VerifyEmail token="tok" /></StrictMode>);
    expect(screen.getByRole("status").textContent).toMatch(/Verifying/);
    expect(await screen.findByText("Email verified")).toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("shows an invalid link message on 400", async () => {
    mockFetch(() => problem(400, "This link is invalid or has expired"));
    render(<VerifyEmail token="bad" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid or has expired/);
  });
  it("shows invalid without a token and makes no request", () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    render(<VerifyEmail token={null} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it("shows a retry message when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("x"); }));
    render(<VerifyEmail token="t" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Reload/);
  });
});

describe("verification banner in SiteNav", () => {
  const me = (emailVerified: boolean) => ({ id: "u", email: "a@b.c", displayName: "Ada", isMinor: false, emailVerified });
  const wrap = () => render(<QueryClientProvider client={new QueryClient()}><SiteNav /></QueryClientProvider>);

  it("is hidden for verified users", async () => {
    mockFetch(() => Response.json(me(true)));
    wrap();
    await screen.findByText("Ada");
    expect(screen.queryByText("Resend verification email")).toBeNull();
  });
  it("is hidden when signed out", async () => {
    mockFetch(() => problem(401, "Not signed in"));
    wrap();
    await screen.findByText("Log in");
    expect(screen.queryByText("Resend verification email")).toBeNull();
  });
  it("resends and confirms", async () => {
    const f = mockFetch((url, method) => url.endsWith("/auth/email/send-verification") && method === "POST"
      ? Response.json({ ok: true }, { status: 202 }) : Response.json(me(false)));
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByText(/Verification email sent/)).toBeTruthy();
    expect(f.mock.calls.some(([u, i]) => String(u).endsWith("send-verification") && i?.method === "POST")).toBe(true);
  });
  it("shows a friendly message on 429", async () => {
    mockFetch((url, method) => method === "POST" ? problem(429, "Too Many Requests") : Response.json(me(false)));
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Resend verification email" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Too many requests/));
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeTruthy();
  });
});
