import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { CourtMap, type PublicCourt } from "../lib/court-map";

const mockCourts: PublicCourt[] = [
  {
    id: "c1",
    name: "Rucker Park",
    lat: 40.8296,
    lng: -73.9361,
    indoor: false,
    surface: "Asphalt",
    hoops: 2,
    lit: true,
    accessNotes: "Historic streetball court. Public access.",
    verificationStatus: "OFFICIAL",
    distanceM: 450,
  },
  {
    id: "c2",
    name: "Chelsea Piers Field House",
    lat: 40.7484,
    lng: -74.0086,
    indoor: true,
    surface: "Hardwood",
    hoops: 6,
    lit: true,
    accessNotes: "Membership or day pass required.",
    verificationStatus: "COMMUNITY_VERIFIED",
    distanceM: 2800,
  },
  {
    id: "c3",
    name: "Corner Pocket Court",
    lat: 40.8100,
    lng: -73.9500,
    indoor: false,
    surface: "Concrete",
    hoops: 1,
    lit: false,
    accessNotes: null,
    verificationStatus: "UNVERIFIED",
    distanceM: 1200,
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("CourtMap", () => {
  it("renders interactive court map and court markers", () => {
    renderWithProviders(
      <CourtMap
        courts={mockCourts}
        centerLat={40.82}
        centerLng={-73.94}
        radiusM={5000}
      />
    );

    // Map container exists
    expect(screen.getByRole("region", { name: "Interactive basketball court map" })).toBeTruthy();

    // All 3 courts should be rendered as markers
    expect(screen.getByRole("button", { name: /Court Rucker Park/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Court Chelsea Piers/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Court Corner Pocket/ })).toBeTruthy();
  });

  it("selects court pin on click and renders Court Detail Card", () => {
    const handleSelect = vi.fn();
    renderWithProviders(
      <CourtMap
        courts={mockCourts}
        centerLat={40.82}
        centerLng={-73.94}
        radiusM={5000}
        onSelectCourt={handleSelect}
      />
    );

    const ruckerPin = screen.getByRole("button", { name: /Court Rucker Park/ });
    fireEvent.click(ruckerPin);

    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", name: "Rucker Park" }));

    // Detail card should display court metadata
    expect(screen.getByText("Historic streetball court. Public access.")).toBeTruthy();
    expect(screen.getByText(/Night floodlights/)).toBeTruthy();
    expect(screen.getByText(/450 m/)).toBeTruthy();

    // Action links should be present
    expect(screen.getByText("Host a game here")).toBeTruthy();
    expect(screen.getByText("Find runs near this court")).toBeTruthy();
  });

  it("filters courts by indoor/outdoor and verification status", () => {
    renderWithProviders(
      <CourtMap
        courts={mockCourts}
        centerLat={40.82}
        centerLng={-73.94}
        radiusM={5000}
      />
    );

    // Switch to List View for easy count assertion
    fireEvent.click(screen.getByText(/List View/));
    expect(screen.getByText("Rucker Park")).toBeTruthy();
    expect(screen.getByText("Chelsea Piers Field House")).toBeTruthy();
    expect(screen.getByText("Corner Pocket Court")).toBeTruthy();

    // Filter to Indoor only
    fireEvent.change(screen.getByLabelText("Type:"), { target: { value: "INDOOR" } });
    expect(screen.queryByText("Rucker Park")).toBeNull();
    expect(screen.getByText("Chelsea Piers Field House")).toBeTruthy();
    expect(screen.queryByText("Corner Pocket Court")).toBeNull();

    // Filter to Verified only
    fireEvent.change(screen.getByLabelText("Type:"), { target: { value: "ALL" } });
    fireEvent.click(screen.getByLabelText("Verified only"));
    expect(screen.getByText("Rucker Park")).toBeTruthy();
    expect(screen.getByText("Chelsea Piers Field House")).toBeTruthy();
    expect(screen.queryByText("Corner Pocket Court")).toBeNull();
  });

  it("triggers onCenterChange when preset hub button is clicked", () => {
    const handleCenterChange = vi.fn();
    renderWithProviders(
      <CourtMap
        courts={mockCourts}
        centerLat={40.82}
        centerLng={-73.94}
        radiusM={5000}
        onCenterChange={handleCenterChange}
      />
    );

    const ruckerPreset = screen.getByText("Rucker Park (NYC)");
    fireEvent.click(ruckerPreset);

    expect(handleCenterChange).toHaveBeenCalledWith(40.8296, -73.9361);
  });
});
