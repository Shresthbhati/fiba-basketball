import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafetyPanel } from "../lib/safety-panel";

let calls: string[];
let state: { me: object; family: object; consents: object; ward?: object };

function mockApi() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push(key);
    if (key === "GET /me") return Response.json(state.me);
    if (key === "GET /consents") return Response.json(state.consents);
    if (key === "GET /guardians") return Response.json(state.family);
    if (key === "GET /blocks") return Response.json({ items: [{ userId: "u9", displayName: "Pat", kind: "MUTE" }] });
    if (key.startsWith("GET /consents?subjectId=")) return Response.json(state.ward ?? {});
    return new Response(null, { status: 204 });
  }));
}
const noConsent = { PUBLIC_PICKUP: false, PROFILE_DISCOVERY: false, MEDIA_USE: false };
beforeEach(() => { calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SafetyPanel", () => {
  it("minor: can invite a guardian and cannot grant themselves permissions", async () => {
    state = {
      me: { id: "m1", email: "k@x.com", displayName: "Kid", isMinor: true, emailVerified: false },
      consents: noConsent, family: { guardians: [], wards: [], invitations: [] },
    };
    mockApi();
    render(<SafetyPanel />);
    expect(await screen.findByText(/No guardian yet/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Allow:/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Guardian email"), { target: { value: "mum@x.com" } });
    fireEvent.click(screen.getByText("Invite"));
    await waitFor(() => expect(calls).toContain("POST /guardians"));
  });

  it("minor: can withdraw a permission a guardian gave", async () => {
    state = {
      me: { id: "m1", email: "k@x.com", displayName: "Kid", isMinor: true, emailVerified: false },
      consents: { ...noConsent, PUBLIC_PICKUP: true }, family: { guardians: [{ id: "g1", guardianEmail: "mum@x.com", status: "ACTIVE" }], wards: [], invitations: [] },
    };
    mockApi();
    render(<SafetyPanel />);
    fireEvent.click(await screen.findByLabelText("Withdraw: Join public pickup games"));
    await waitFor(() => expect(calls).toContain("DELETE /consents/PUBLIC_PICKUP"));
  });

  it("guardian: accepts a request and grants a ward a permission", async () => {
    state = {
      me: { id: "p1", email: "mum@x.com", displayName: "Mum", isMinor: false, emailVerified: true },
      consents: noConsent,
      family: { guardians: [], wards: [{ id: "g1", minorId: "m1", minorName: "Kid" }], invitations: [{ id: "g2", minorName: "Teen" }] },
      ward: noConsent,
    };
    mockApi();
    render(<SafetyPanel />);
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(calls).toContain("POST /guardians/g2/accept"));
    expect(await screen.findByText("Permissions for Kid")).toBeTruthy();
    fireEvent.click((await screen.findAllByLabelText("Allow: Join public pickup games"))[1]!);
    await waitFor(() => expect(calls).toContain("PUT /consents/PUBLIC_PICKUP"));
  });

  it("shows blocked people with an undo, and a login prompt when signed out", async () => {
    state = {
      me: { id: "p1", email: "a@x.com", displayName: "A", isMinor: false, emailVerified: true },
      consents: noConsent, family: { guardians: [], wards: [], invitations: [] },
    };
    mockApi();
    render(<SafetyPanel />);
    fireEvent.click(await screen.findByLabelText("Unblock Pat"));
    await waitFor(() => expect(calls).toContain("DELETE /blocks/u9"));
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ title: "Not signed in" }, { status: 401 })));
    render(<SafetyPanel />);
    expect(await screen.findByText("Log in to manage safety and family settings.")).toBeTruthy();
  });
});
