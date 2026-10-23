import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import {
  createTacticalPlay,
  getTacticalPlay,
  listTacticalPlays,
  updateTacticalPlay,
  deleteTacticalPlay,
} from "./service.js";

const idParam = z.object({ id: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const tokenSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.enum(["offense", "defense", "ball"]),
  label: z.string().min(1).max(10),
  x: z.number(),
  y: z.number(),
});

const actionSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.enum(["cut", "pass", "dribble", "screen", "slide"]),
  from: z.object({ x: z.number(), y: z.number() }),
  to: z.object({ x: z.number(), y: z.number() }),
  label: z.string().max(50).optional(),
});

const keyframeSchema = z.object({
  step: z.number().int().min(1).max(20),
  description: z.string().max(500),
  tokens: z.array(tokenSchema),
  actions: z.array(actionSchema),
});

const createPlayBody = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  teamId: z.string().uuid().optional(),
  courtMode: z.enum(["half", "full"]).default("half"),
  category: z.enum(["offense", "defense", "inbound", "set_piece", "press_break"]).default("offense"),
  tags: z.array(z.string().trim().max(50)).default([]),
  keyframes: z.array(keyframeSchema).min(1),
});

const updatePlayBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  teamId: z.string().uuid().optional(),
  courtMode: z.enum(["half", "full"]).optional(),
  category: z.enum(["offense", "defense", "inbound", "set_piece", "press_break"]).optional(),
  tags: z.array(z.string().trim().max(50)).optional(),
  keyframes: z.array(keyframeSchema).min(1).optional(),
});

const listQuery = z.object({
  teamId: z.string().uuid().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
});

export function registerPlaybook(app: FastifyInstance, db: Db) {
  // 1. Create a new tactical play
  app.post("/api/v1/playbook/plays", authed, async (req, reply) => {
    const body = createPlayBody.parse(req.body);
    const play = await createTacticalPlay(db, me(req), body);
    return reply.status(201).send(play);
  });

  // 2. List tactical plays visible to the current user
  app.get("/api/v1/playbook/plays", authed, async (req) => {
    const query = listQuery.parse(req.query);
    const items = await listTacticalPlays(db, me(req), query);
    return { items };
  });

  // 3. Get single play details
  app.get("/api/v1/playbook/plays/:id", authed, async (req) => {
    const play = await getTacticalPlay(db, idOf(req), me(req));
    if (!play) {
      throw new AuthError(404, "Play not found");
    }
    return play;
  });

  // 4. Update play
  app.put("/api/v1/playbook/plays/:id", authed, async (req) => {
    const body = updatePlayBody.parse(req.body);
    const updated = await updateTacticalPlay(db, idOf(req), me(req), body);
    return updated;
  });

  // 5. Delete play
  app.delete("/api/v1/playbook/plays/:id", authed, async (req, reply) => {
    await deleteTacticalPlay(db, idOf(req), me(req));
    return reply.status(204).send();
  });

  // 6. Export play as JSON
  app.get("/api/v1/playbook/plays/:id/export", authed, async (req) => {
    const play = await getTacticalPlay(db, idOf(req), me(req));
    if (!play) {
      throw new AuthError(404, "Play not found");
    }
    return {
      format: "courtiq-playbook-v1",
      exportedAt: new Date().toISOString(),
      play,
    };
  });
}
