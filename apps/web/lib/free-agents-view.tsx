"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  LoadingState,
  Select,
} from "@courtiq/design-system";
import { api, ApiError, type Me } from "./api";

export interface FreeAgentItem {
  id: string;
  userId: string;
  displayName: string;
  city: string;
  primaryPosition: "PG" | "SG" | "SF" | "PF" | "C";
  secondaryPositions: ("PG" | "SG" | "SF" | "PF" | "C")[];
  skillLevel: "OPEN" | "CASUAL" | "INTERMEDIATE" | "COMPETITIVE";
  experienceYears: number;
  availability: "WEEKDAYS" | "WEEKENDS" | "EVENINGS" | "ANYTIME";
  bio: string | null;
  status: "ACTIVE" | "MATCHED" | "INACTIVE";
  linkedCommunityId: string | null;
  createdAt: string;
}

export interface MyInvitationItem {
  id: string;
  teamId: string;
  teamName: string;
  role: string;
  message: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
}

export interface CoachedTeam {
  id: string;
  name: string;
}

export function FreeAgentsView() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"directory" | "my-status">("directory");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [skillFilter, setSkillFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("");

  // Creation modal state
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [primaryPos, setPrimaryPos] = useState<"PG" | "SG" | "SF" | "PF" | "C">("PG");
  const [skill, setSkill] = useState<"OPEN" | "CASUAL" | "INTERMEDIATE" | "COMPETITIVE">("COMPETITIVE");
  const [city, setCity] = useState("");
  const [experience, setExperience] = useState("3");
  const [availability, setAvailability] = useState<"WEEKDAYS" | "WEEKENDS" | "EVENINGS" | "ANYTIME">("ANYTIME");
  const [bio, setBio] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  // Invite modal state
  const [selectedAgent, setSelectedAgent] = useState<FreeAgentItem | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Current user
  const { data: me } = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me").catch(() => null),
  });

  // Query free agents directory
  const { data: directoryData, isLoading: isDirLoading } = useQuery<{ items: FreeAgentItem[] }>({
    queryKey: ["free-agents", positionFilter, skillFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (positionFilter !== "ALL") params.set("position", positionFilter);
      if (skillFilter !== "ALL") params.set("skillLevel", skillFilter);
      const qs = params.toString();
      return api<{ items: FreeAgentItem[] }>(`/free-agents${qs ? `?${qs}` : ""}`);
    },
  });

  const agents = directoryData?.items ?? [];

  // Filtered by city client-side
  const filteredAgents = useMemo(() => {
    if (!cityFilter.trim()) return agents;
    const q = cityFilter.toLowerCase();
    return agents.filter((a) => a.city.toLowerCase().includes(q));
  }, [agents, cityFilter]);

  // Query my listing
  const { data: myListingData } = useQuery<{ item: FreeAgentItem | null }>({
    queryKey: ["my-free-agent-listing"],
    queryFn: () => api<{ item: FreeAgentItem | null }>("/free-agents/mine"),
    enabled: !!me,
  });

  // Query my pending invitations
  const { data: myInvitesData } = useQuery<{ items: MyInvitationItem[] }>({
    queryKey: ["my-team-invitations"],
    queryFn: () => api<{ items: MyInvitationItem[] }>("/me/team-invitations"),
    enabled: !!me,
  });

  // Query teams coached by user
  const { data: teamsData } = useQuery<{ items: CoachedTeam[] }>({
    queryKey: ["my-coached-teams"],
    queryFn: () => api<{ items: CoachedTeam[] }>("/teams").catch(() => ({ items: [] })),
    enabled: !!me,
  });

  const coachedTeams = teamsData?.items ?? [];

  // Create listing mutation
  const listMutation = useMutation({
    mutationFn: async () => {
      return api<FreeAgentItem>("/free-agents", {
        method: "POST",
        body: {
          city: city.trim(),
          primaryPosition: primaryPos,
          skillLevel: skill,
          experienceYears: Number(experience) || 0,
          availability,
          bio: bio.trim() ? bio.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["free-agents"] });
      qc.invalidateQueries({ queryKey: ["my-free-agent-listing"] });
      setIsListModalOpen(false);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setListError(err.message);
      } else {
        setListError("Failed to save free agent listing.");
      }
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent || !selectedTeamId) throw new Error("Select a team");
      return api(`/teams/${selectedTeamId}/invitations`, {
        method: "POST",
        body: {
          userId: selectedAgent.userId,
          role: "PLAYER",
          message: inviteMessage.trim() ? inviteMessage.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      setSelectedAgent(null);
      setInviteMessage("");
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setInviteError(err.message);
      } else {
        setInviteError("Failed to send invitation.");
      }
    },
  });

  // Respond mutation
  const respondMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "ACCEPTED" | "DECLINED" }) => {
      return api(`/me/team-invitations/${id}/respond`, {
        method: "POST",
        body: { action },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-team-invitations"] });
      qc.invalidateQueries({ queryKey: ["my-free-agent-listing"] });
      qc.invalidateQueries({ queryKey: ["free-agents"] });
    },
  });

  const myListing = myListingData?.item;
  const myInvitations = myInvitesData?.items ?? [];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Pickup-to-Team Pathway & Free Agents</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            Bridge pickup runs into organized competition. Connect unsigned talent with team rosters.
          </p>
        </div>

        {me && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant={activeTab === "directory" ? "primary" : "secondary"}
              onClick={() => setActiveTab("directory")}
            >
              Free Agent Pool
            </Button>
            <Button
              variant={activeTab === "my-status" ? "primary" : "secondary"}
              onClick={() => setActiveTab("my-status")}
            >
              My Status {myInvitations.filter((i) => i.status === "PENDING").length > 0 && `(${myInvitations.filter((i) => i.status === "PENDING").length})`}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setListError(null);
                if (myListing) {
                  setCity(myListing.city);
                  setPrimaryPos(myListing.primaryPosition);
                  setSkill(myListing.skillLevel);
                  setExperience(String(myListing.experienceYears));
                  setAvailability(myListing.availability);
                  setBio(myListing.bio ?? "");
                }
                setIsListModalOpen(true);
              }}
            >
              {myListing ? "Edit My Listing" : "+ List as Free Agent"}
            </Button>
          </div>
        )}
      </div>

      {activeTab === "directory" && (
        <>
          {/* Filters */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              background: "var(--surface)",
              padding: 12,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <div style={{ flex: "1 1 200px" }}>
              <Input
                label="City / Region"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                placeholder="Search city (e.g. New York, NY)..."
              />
            </div>

            <div style={{ minWidth: 140 }}>
              <Select
                label="Position"
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                options={[
                  { value: "ALL", label: "All Positions" },
                  { value: "PG", label: "Point Guard (PG)" },
                  { value: "SG", label: "Shooting Guard (SG)" },
                  { value: "SF", label: "Small Forward (SF)" },
                  { value: "PF", label: "Power Forward (PF)" },
                  { value: "C", label: "Center (C)" },
                ]}
              />
            </div>

            <div style={{ minWidth: 160 }}>
              <Select
                label="Skill Band"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                options={[
                  { value: "ALL", label: "All Skill Levels" },
                  { value: "OPEN", label: "Open / Rec" },
                  { value: "CASUAL", label: "Casual" },
                  { value: "INTERMEDIATE", label: "Intermediate" },
                  { value: "COMPETITIVE", label: "Competitive" },
                ]}
              />
            </div>
          </div>

          {/* Directory Grid */}
          {isDirLoading ? (
            <LoadingState message="Discovering available free agents..." />
          ) : filteredAgents.length === 0 ? (
            <EmptyState
              title="No free agents listed"
              description="No active ballers matching this position or city right now. List yourself as a free agent to get scouted!"
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              {filteredAgents.map((agent) => (
                <Card
                  key={agent.id}
                  title={agent.displayName}
                  badge={
                    <div style={{ display: "flex", gap: 6 }}>
                      <Badge variant="brand">{agent.primaryPosition}</Badge>
                      <Badge variant="info">{agent.skillLevel}</Badge>
                    </div>
                  }
                  actions={
                    me && me.id !== agent.userId && coachedTeams.length > 0 ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setInviteError(null);
                          setSelectedTeamId(coachedTeams[0]?.id ?? "");
                          setSelectedAgent(agent);
                        }}
                      >
                        Invite to Team
                      </Button>
                    ) : undefined
                  }
                >
                  <div style={{ display: "grid", gap: 8, fontSize: "0.88rem" }}>
                    <div style={{ display: "flex", gap: 14, color: "var(--muted)", fontSize: "0.82rem" }}>
                      <span>📍 {agent.city}</span>
                      <span>🏀 {agent.experienceYears}y experience</span>
                      <span>🕒 {agent.availability}</span>
                    </div>

                    <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.4 }}>
                      {agent.bio || "Available for team recruitment and competitive runs."}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "my-status" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* My Current Listing Card */}
          <Card title="My Free Agent Profile">
            {myListing ? (
              <div style={{ display: "grid", gap: 10, fontSize: "0.9rem" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge variant={myListing.status === "MATCHED" ? "success" : "brand"}>
                    {myListing.status === "MATCHED" ? "✓ Matched with Team" : "🟢 Active Free Agent"}
                  </Badge>
                  <Badge variant="info">{myListing.primaryPosition}</Badge>
                  <Badge variant="neutral">{myListing.city}</Badge>
                </div>
                <p style={{ margin: 0, color: "var(--muted)" }}>{myListing.bio || "No bio entered."}</p>
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                You have not listed yourself as a free agent yet. Click "+ List as Free Agent" to make yourself discoverable to teams!
              </div>
            )}
          </Card>

          {/* Pending Invitations */}
          <Card title="Team Invitations & Offers">
            {myInvitations.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "8px 0" }}>
                No team invitations yet. Keep balling in pickup runs and make sure your free agent bio is active!
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {myInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <strong>{inv.teamName}</strong>
                        <Badge variant={inv.status === "ACCEPTED" ? "success" : inv.status === "PENDING" ? "brand" : "neutral"}>
                          {inv.status}
                        </Badge>
                      </div>
                      {inv.message && (
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                          "{inv.message}"
                        </div>
                      )}
                    </div>

                    {inv.status === "PENDING" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => respondMutation.mutate({ id: inv.id, action: "DECLINED" })}
                          disabled={respondMutation.isPending}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => respondMutation.mutate({ id: inv.id, action: "ACCEPTED" })}
                          disabled={respondMutation.isPending}
                        >
                          Accept Invitation
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* List as Free Agent Dialog */}
      <Dialog
        open={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        title="Free Agent Profile"
        description="Share your position, skills, and availability with coaches looking for players."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setListError(null);
            listMutation.mutate();
          }}
          style={{ display: "grid", gap: 14 }}
        >
          {listError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {listError}
            </div>
          )}

          <Input
            label="City / Metro Area"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. New York, NY"
            required
            maxLength={100}
          />

          <Select
            label="Primary Position"
            value={primaryPos}
            onChange={(e) => setPrimaryPos(e.target.value as "PG" | "SG" | "SF" | "PF" | "C")}
            options={[
              { value: "PG", label: "Point Guard (PG)" },
              { value: "SG", label: "Shooting Guard (SG)" },
              { value: "SF", label: "Small Forward (SF)" },
              { value: "PF", label: "Power Forward (PF)" },
              { value: "C", label: "Center (C)" },
            ]}
          />

          <Select
            label="Skill Level"
            value={skill}
            onChange={(e) => setSkill(e.target.value as "OPEN" | "CASUAL" | "INTERMEDIATE" | "COMPETITIVE")}
            options={[
              { value: "OPEN", label: "Open / Rec" },
              { value: "CASUAL", label: "Casual" },
              { value: "INTERMEDIATE", label: "Intermediate" },
              { value: "COMPETITIVE", label: "Competitive Tournament" },
            ]}
          />

          <Input
            label="Years of Experience"
            type="number"
            min={0}
            max={50}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            required
          />

          <Select
            label="Availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value as "WEEKDAYS" | "WEEKENDS" | "EVENINGS" | "ANYTIME")}
            options={[
              { value: "ANYTIME", label: "Flexible / Anytime" },
              { value: "WEEKENDS", label: "Weekends Only" },
              { value: "EVENINGS", label: "Weekday Evenings" },
              { value: "WEEKDAYS", label: "Weekdays" },
            ]}
          />

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Player Bio & Style of Play (Optional)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="e.g. 3-and-D guard, strong on-ball defense, vocal communicator..."
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsListModalOpen(false)}
              disabled={listMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={listMutation.isPending}>
              Save Profile
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Invite to Team Dialog */}
      <Dialog
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        title={`Invite ${selectedAgent?.displayName ?? "Player"} to Team`}
        description="Extend a roster spot invitation for upcoming practices and competitions."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setInviteError(null);
            inviteMutation.mutate();
          }}
          style={{ display: "grid", gap: 14 }}
        >
          {inviteError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {inviteError}
            </div>
          )}

          <Select
            label="Select Team"
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            options={coachedTeams.map((t) => ({ value: t.id, label: t.name }))}
          />

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
              Personal Invitation Message
            </label>
            <textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="We saw your play at the weekend run and want you to join our squad!"
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedAgent(null)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={inviteMutation.isPending}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
