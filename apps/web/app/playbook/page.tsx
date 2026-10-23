"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlaybookEditor, DEFAULT_HORNS_PLAY } from "../../lib/playbook-editor";
import { api, ApiError } from "../../lib/api";
import type { TacticalPlay } from "@courtiq/court-renderer";

const PRESET_PLAYS: TacticalPlay[] = [
  DEFAULT_HORNS_PLAY,
  {
    id: "preset-spanish-pnr",
    title: "Spanish Pick & Roll (Stack)",
    description: "Ball screen at top of key followed immediately by a back-screen on the drop big.",
    category: "offense",
    courtMode: "half",
    tags: ["pnr", "stack", "spanish"],
    version: 1,
    keyframes: [
      {
        step: 1,
        description: "Initial Stack: 1 at top; 5 prepares ball screen; 3 positions directly behind 5.",
        tokens: [
          { id: "o1", type: "offense", label: "1", x: 6.5, y: 0.0 },
          { id: "o5", type: "offense", label: "5", x: 8.0, y: -1.0 },
          { id: "o3", type: "offense", label: "3", x: 9.5, y: -1.0 },
          { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
          { id: "o4", type: "offense", label: "4", x: 13.0, y: 6.5 },
          { id: "d1", type: "defense", label: "x1", x: 7.5, y: 0.0 },
          { id: "d5", type: "defense", label: "x5", x: 8.5, y: -1.5 },
          { id: "ball", type: "ball", label: "ball", x: 6.5, y: 0.0 },
        ],
        actions: [
          { id: "a1", type: "screen", from: { x: 8.0, y: -1.0 }, to: { x: 7.5, y: 0.0 }, label: "Ball Screen" },
          { id: "a2", type: "screen", from: { x: 9.5, y: -1.0 }, to: { x: 8.5, y: -1.5 }, label: "Back Screen" },
        ],
      },
      {
        step: 2,
        description: "Roll and Flare: 5 rolls to rim, 3 flares to 3PT arc, 1 drives downhill.",
        tokens: [
          { id: "o1", type: "offense", label: "1", x: 9.0, y: 1.5 },
          { id: "o5", type: "offense", label: "5", x: 12.0, y: 0.0 },
          { id: "o3", type: "offense", label: "3", x: 6.0, y: -2.5 },
          { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
          { id: "o4", type: "offense", label: "4", x: 13.0, y: 6.5 },
          { id: "d1", type: "defense", label: "x1", x: 8.5, y: 0.5 },
          { id: "d5", type: "defense", label: "x5", x: 10.5, y: -0.5 },
          { id: "ball", type: "ball", label: "ball", x: 9.0, y: 1.5 },
        ],
        actions: [
          { id: "a3", type: "pass", from: { x: 9.0, y: 1.5 }, to: { x: 12.0, y: 0.0 }, label: "Lob Pass" },
        ],
      },
    ],
  },
  {
    id: "preset-2-3-zone",
    title: "2-3 Matchup Zone",
    description: "Standard 2 guards at high tandem, 3 frontcourt players protecting paint and corners.",
    category: "defense",
    courtMode: "half",
    tags: ["defense", "zone"],
    version: 1,
    keyframes: [
      {
        step: 1,
        description: "High Tandem: Guard 1 and Guard 2 contest top of key; 3 and 4 shade wings; 5 anchors rim.",
        tokens: [
          { id: "d1", type: "defense", label: "x1", x: 7.5, y: -2.0 },
          { id: "d2", type: "defense", label: "x2", x: 7.5, y: 2.0 },
          { id: "d3", type: "defense", label: "x3", x: 11.5, y: -5.5 },
          { id: "d4", type: "defense", label: "x4", x: 11.5, y: 5.5 },
          { id: "d5", type: "defense", label: "x5", x: 12.0, y: 0.0 },
          { id: "o1", type: "offense", label: "1", x: 6.0, y: 0.0 },
          { id: "ball", type: "ball", label: "ball", x: 6.0, y: 0.0 },
        ],
        actions: [
          { id: "a1", type: "slide", from: { x: 7.5, y: -2.0 }, to: { x: 6.5, y: -0.5 } },
        ],
      },
    ],
  },
];

export default function PlaybookPage() {
  const queryClient = useQueryClient();
  const [activePlay, setActivePlay] = useState<TacticalPlay>(PRESET_PLAYS[0]!);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Fetch user's saved plays
  const { data: userPlaysData } = useQuery({
    queryKey: ["playbook-plays"],
    queryFn: async () => {
      try {
        const res = await api<{ items: TacticalPlay[] }>("/playbook/plays");
        return res.items;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return [];
        return [];
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (play: TacticalPlay) => {
      // If play is preset, create a new saved play copy
      if (play.id.startsWith("preset-")) {
        const payload = {
          title: play.title,
          description: play.description,
          courtMode: play.courtMode,
          category: play.category,
          tags: play.tags,
          keyframes: play.keyframes,
        };
        const created = await api<TacticalPlay>("/playbook/plays", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return created;
      }

      // Existing saved play
      const payload = {
        title: play.title,
        description: play.description,
        courtMode: play.courtMode,
        category: play.category,
        tags: play.tags,
        keyframes: play.keyframes,
      };
      return api<TacticalPlay>(`/playbook/plays/${play.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (savedPlay) => {
      setStatusMsg({ text: `Play "${savedPlay.title}" saved successfully (v${savedPlay.version})!` });
      setActivePlay(savedPlay);
      queryClient.invalidateQueries({ queryKey: ["playbook-plays"] });
      setTimeout(() => setStatusMsg(null), 4000);
    },
    onError: (err) => {
      setStatusMsg({ text: `Failed to save play: ${err.message}`, error: true });
    },
  });

  const allPlays = [...(userPlaysData ?? []), ...PRESET_PLAYS];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.75rem", fontWeight: 800 }}>Tactical Playbook Lab</h1>
        <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.95rem" }}>
          Author, sequence, and review basketball plays with deterministic Level-1 diagrammatic animation.
        </p>
      </div>

      {statusMsg && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 6,
            backgroundColor: statusMsg.error ? "#7f1d1d" : "#064e3b",
            color: statusMsg.error ? "#fecaca" : "#a7f3d0",
            fontSize: "0.88rem",
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Play Selector Strip */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 16 }}>
        {allPlays.map((p) => {
          const isSelected = p.id === activePlay.id;
          return (
            <button
              key={p.id}
              type="button"
              className={isSelected ? "primary" : "secondary"}
              style={{
                padding: "8px 14px",
                whiteSpace: "nowrap",
                fontSize: "0.85rem",
                borderRadius: 8,
              }}
              onClick={() => setActivePlay(p)}
            >
              <strong>{p.title}</strong>
              <span style={{ marginLeft: 6, opacity: 0.8, fontSize: "0.75rem" }}>
                ({p.category})
              </span>
            </button>
          );
        })}

        <button
          type="button"
          className="secondary"
          style={{ padding: "8px 14px", whiteSpace: "nowrap", fontSize: "0.85rem", borderRadius: 8 }}
          onClick={() => {
            const newPlay: TacticalPlay = {
              id: `preset-new-${Date.now()}`,
              title: "New Tactical Play",
              description: "Custom basketball set",
              category: "offense",
              courtMode: "half",
              tags: ["custom"],
              version: 1,
              keyframes: [
                {
                  step: 1,
                  description: "Initial Formation",
                  tokens: [
                    { id: "o1", type: "offense", label: "1", x: 7.0, y: 0.0 },
                    { id: "ball", type: "ball", label: "ball", x: 7.0, y: 0.0 },
                  ],
                  actions: [],
                },
              ],
            };
            setActivePlay(newPlay);
          }}
        >
          + New Play
        </button>
      </div>

      {/* Editor & Animator Canvas */}
      <PlaybookEditor
        key={activePlay.id}
        initialPlay={activePlay}
        onSave={(updated) => saveMutation.mutate(updated)}
      />
    </div>
  );
}
