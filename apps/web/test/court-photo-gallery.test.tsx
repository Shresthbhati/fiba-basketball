import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CourtPhotoGallery, type CourtPhoto, type CourtVerificationsResponse } from "../lib/court-photo-gallery";
import * as apiModule from "../lib/api";

const mockPhotos: CourtPhoto[] = [
  {
    id: "photo-1",
    courtId: "court-123",
    userId: "user-1",
    userDisplayName: "Jordan Poole",
    url: "https://images.unsplash.com/photo-court-1.jpg",
    caption: "Sunset pickup run at the cage",
    isPrimary: true,
    status: "ACTIVE",
    createdAt: "2026-10-25T12:00:00Z",
  },
  {
    id: "photo-2",
    courtId: "court-123",
    userId: "user-2",
    userDisplayName: "Tyrese Haliburton",
    url: "https://images.unsplash.com/photo-court-2.jpg",
    caption: "Freshly painted double rim",
    isPrimary: false,
    status: "ACTIVE",
    createdAt: "2026-10-25T14:30:00Z",
  },
];

const mockVerifications: CourtVerificationsResponse = {
  courtId: "court-123",
  totalConfirmations: 2,
  verificationStatus: "UNVERIFIED",
  consensus: {
    surfaces: { ASPHALT: 2 },
    hoops: { 2: 2 },
    lit: { yes: 2, no: 0 },
    indoor: { yes: 0, no: 2 },
  },
  recentConfirmations: [
    {
      userId: "user-1",
      userDisplayName: "Jordan Poole",
      confirmedSurface: "ASPHALT",
      confirmedHoops: 2,
      confirmedLit: true,
      confirmedIndoor: false,
      notes: "Clean asphalt with solid chains",
      createdAt: "2026-10-25T12:00:00Z",
    },
  ],
};

describe("CourtPhotoGallery Component (Spec §8.1, §8.3, WP-1.11, WP-2.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders photo carousel with primary badge, uploader name, and thumbnail switching", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.endsWith("/photos")) {
        return { items: mockPhotos } as never;
      }
      if (typeof url === "string" && url.endsWith("/verifications")) {
        return mockVerifications as never;
      }
      return {} as never;
    });

    render(
      <CourtPhotoGallery
        courtId="court-123"
        courtName="West 4th Cage"
        initialStatus="UNVERIFIED"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Court Photos & Verification/i)).toBeDefined();
      expect(screen.getByText("(2 photos)")).toBeDefined();
      expect(screen.getByText("Sunset pickup run at the cage")).toBeDefined();
      expect(screen.getByText("By Jordan Poole")).toBeDefined();
      expect(screen.getByText("PRIMARY")).toBeDefined();
    });

    // Check thumbnails exist
    const thumbnails = screen.getAllByRole("button").filter((b) => b.querySelector("img"));
    expect(thumbnails.length).toBe(2);

    // Click the second thumbnail
    fireEvent.click(thumbnails[1]!);

    await waitFor(() => {
      expect(screen.getByText("Freshly painted double rim")).toBeDefined();
      expect(screen.getByText("By Tyrese Haliburton")).toBeDefined();
    });
  });

  it("renders community verification progress bar and consensus badges", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.endsWith("/photos")) {
        return { items: [] } as never;
      }
      if (typeof url === "string" && url.endsWith("/verifications")) {
        return mockVerifications as never;
      }
      return {} as never;
    });

    render(
      <CourtPhotoGallery
        courtId="court-123"
        courtName="West 4th Cage"
        initialStatus="UNVERIFIED"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Community Verification \(2\/3 confirmations\)/i)).toBeDefined();
      expect(screen.getByText("Surface: ASPHALT (2)")).toBeDefined();
      expect(screen.getByText("Hoops: 2 (2)")).toBeDefined();
      expect(screen.getByText("Night Lights: 2 votes")).toBeDefined();
      expect(screen.getByText(/No photos uploaded for this court yet/i)).toBeDefined();
    });
  });

  it("submits new photo upload via POST /courts/:id/photos and refreshes", async () => {
    let photosList = [...mockPhotos];

    vi.spyOn(apiModule, "api").mockImplementation(async (url, opts) => {
      if (typeof url === "string" && url.endsWith("/photos")) {
        if (opts?.method === "POST") {
          const body = (opts as { body: { url: string; caption?: string; isPrimary?: boolean } }).body;
          photosList = [
            ...photosList,
            {
              id: "photo-3",
              courtId: "court-123",
              userId: "user-3",
              userDisplayName: "Stephen Curry",
              url: body.url,
              caption: body.caption ?? null,
              isPrimary: !!body.isPrimary,
              status: "ACTIVE",
              createdAt: new Date().toISOString(),
            },
          ];
          return { id: "photo-3", ok: true } as never;
        }
        return { items: photosList } as never;
      }
      if (typeof url === "string" && url.endsWith("/verifications")) {
        return mockVerifications as never;
      }
      return {} as never;
    });

    render(
      <CourtPhotoGallery
        courtId="court-123"
        courtName="West 4th Cage"
        initialStatus="UNVERIFIED"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("+ Add Photo")).toBeDefined();
    });

    // Open upload modal
    fireEvent.click(screen.getByText("+ Add Photo"));

    expect(screen.getByText("Upload Court Photo")).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://images.unsplash.com/photo-court-3.jpg" },
    });
    fireEvent.change(screen.getByPlaceholderText("Rim height, court condition, lighting..."), {
      target: { value: "Corner three court perspective" },
    });
    fireEvent.click(screen.getByLabelText(/Set as Primary Court Cover Photo/i));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => {
      expect(screen.getByText("Photo submitted successfully!")).toBeDefined();
      expect(screen.getByAltText("Corner three court perspective")).toBeDefined();
    });

    // Click the newly uploaded thumbnail
    fireEvent.click(screen.getByAltText("Corner three court perspective").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Corner three court perspective")).toBeDefined();
      expect(screen.getByText("By Stephen Curry")).toBeDefined();
    });
  });

  it("submits attribute verification via POST /courts/:id/confirm-attributes and updates consensus", async () => {
    let verificationsData = { ...mockVerifications };

    vi.spyOn(apiModule, "api").mockImplementation(async (url, opts) => {
      if (typeof url === "string" && url.endsWith("/photos")) {
        return { items: [] } as never;
      }
      if (typeof url === "string" && url.endsWith("/confirm-attributes") && opts?.method === "POST") {
        verificationsData = {
          ...verificationsData,
          totalConfirmations: 3,
          verificationStatus: "COMMUNITY_CONFIRMED",
        };
        return { totalConfirmations: 3, verificationStatus: "COMMUNITY_CONFIRMED" } as never;
      }
      if (typeof url === "string" && url.endsWith("/verifications")) {
        return verificationsData as never;
      }
      return {} as never;
    });

    render(
      <CourtPhotoGallery
        courtId="court-123"
        courtName="West 4th Cage"
        initialStatus="UNVERIFIED"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("✓ Verify Attributes")).toBeDefined();
    });

    // Open confirmation modal
    fireEvent.click(screen.getByText("✓ Verify Attributes"));

    expect(screen.getByText("Confirm Court Attributes (Community Consensus)")).toBeDefined();

    // Type notes and submit
    fireEvent.change(screen.getByPlaceholderText("Condition, rim chain nets, double rims..."), {
      target: { value: "Verified in person: great court condition" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit Verification" }));

    await waitFor(() => {
      expect(screen.getByText("Your court verification has been recorded!")).toBeDefined();
      expect(screen.getByText(/Community Verification \(3\/3 confirmations\)/i)).toBeDefined();
      expect(screen.getByText("COMMUNITY_CONFIRMED")).toBeDefined();
    });
  });
});
