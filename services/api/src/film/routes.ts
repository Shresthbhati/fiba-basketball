import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { can } from "../authz/service.js";
import { eq } from "drizzle-orm";
import { competitionTeams, competitions } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { TooLargeError, type MediaStorage } from "../media/storage.js";
import {
  TEAM_ROLES, addMember, createClip, createGame, deleteClip, findGame, listClips, listGames, listMembers, markVideoReady,
  myTeams, readGame, removeMember,
} from "./service.js";
import { linkMatch, matchesOfTeam, setSync, timeline, unlinkMatch } from "./sync.js";

const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } as const;
type VideoType = keyof typeof VIDEO_TYPES;
const idParam = z.object({ id: z.uuid() });
const clipParam = z.object({ id: z.uuid(), clipId: z.uuid() });

export function registerFilm(app: FastifyInstance, db: Db, storage: MediaStorage, maxVideoBytes: number) {
  // Video bodies stay as a stream so a large upload is never held in memory.
  for (const type of Object.keys(VIDEO_TYPES)) app.addContentTypeParser(type, (_req, payload, done) => done(null, payload));

  const teamRef = (req: FastifyRequest) => ({ type: "team", id: idParam.parse(req.params).id });
  // Game routes resolve the game's team; an unknown game yields no resource, so the guard answers 404 like a non-member.
  const gameTeamRef = async (req: FastifyRequest) => {
    const g = await findGame(db, idParam.parse(req.params).id);
    return g ? { type: "team", id: g.teamId } : undefined;
  };
  const view = { action: "team:view", hide: true, resource: teamRef } as const;
  const manageTeam = { action: "team:manage", hide: true, resource: teamRef } as const;
  const addFilm = { action: "film:manage", hide: true, resource: teamRef } as const;
  const viewGame = { action: "team:view", hide: true, resource: gameTeamRef } as const;
  const manageGame = { action: "film:manage", hide: true, resource: gameTeamRef } as const;

  app.get("/api/v1/me/teams", { config: { access: "authenticated" } }, async (req) => ({ items: await myTeams(db, req.user!.id) }));

  app.get("/api/v1/teams/:id/members", { config: { access: view } }, async (req) => {
    const id = idParam.parse(req.params).id;
    return { items: await listMembers(db, id), canManage: await can(db, req.user!.id, "film:manage", { type: "team", id }) };
  });
  app.post("/api/v1/teams/:id/members", { config: { access: manageTeam } }, async (req, reply) => {
    const body = z.object({ email: z.email(), role: z.enum(TEAM_ROLES) }).parse(req.body);
    return reply.status(201).send(await addMember(db, req.user!.id, idParam.parse(req.params).id, body.email, body.role));
  });
  app.delete("/api/v1/teams/:id/members/:userId", { config: { access: manageTeam } }, async (req, reply) => {
    const { id, userId } = z.object({ id: z.uuid(), userId: z.uuid() }).parse(req.params);
    await removeMember(db, req.user!.id, id, userId);
    return reply.status(204).send();
  });

  app.get("/api/v1/teams/:id/competitions", { config: { access: view } }, async (req) => ({
    items: (await db.select({ id: competitions.id, name: competitions.name, status: competitions.status })
      .from(competitionTeams).innerJoin(competitions, eq(competitions.id, competitionTeams.competitionId))
      .where(eq(competitionTeams.teamId, idParam.parse(req.params).id))),
  }));

  app.get("/api/v1/teams/:id/games", { config: { access: view } }, async (req) => ({ items: await listGames(db, idParam.parse(req.params).id) }));
  app.post("/api/v1/teams/:id/games", { config: { access: addFilm } }, async (req, reply) => {
    const body = z.object({
      title: z.string().trim().min(1).max(120), opponent: z.string().trim().max(80).optional(),
      playedOn: z.iso.date().optional(),
    }).parse(req.body);
    return reply.status(201).send(await createGame(db, req.user!.id, idParam.parse(req.params).id, body));
  });
  app.get("/api/v1/film/games/:id", { config: { access: viewGame } }, async (req) => {
    const game = await readGame(db, idParam.parse(req.params).id);
    return { ...game, canManage: await can(db, req.user!.id, "film:manage", { type: "team", id: game.teamId }) };
  });

  app.put("/api/v1/film/games/:id/video", { config: { access: manageGame } }, async (req, reply) => {
    const g = (await findGame(db, idParam.parse(req.params).id))!;
    const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim() as VideoType;
    if (!(type in VIDEO_TYPES)) throw new AuthError(415, "Video must be mp4, webm or mov");
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > maxVideoBytes) throw new AuthError(413, "Video is too large");
    const key = `film/${g.id}/${Date.now()}.${VIDEO_TYPES[type]}`;
    let bytes: number;
    try {
      bytes = await storage.put(key, req.body as NodeJS.ReadableStream as never, maxVideoBytes);
    } catch (e) {
      if (e instanceof TooLargeError) throw new AuthError(413, "Video is too large");
      throw e;
    }
    if (bytes === 0) {
      await storage.remove(key);
      throw new AuthError(400, "Empty upload");
    }
    await markVideoReady(db, g.id, { key, type, bytes });
    if (g.videoKey) await storage.remove(g.videoKey);
    return reply.status(204).send();
  });

  app.get("/api/v1/film/games/:id/video", { config: { access: viewGame } }, async (req, reply) => {
    const g = (await findGame(db, idParam.parse(req.params).id))!;
    if (g.videoStatus !== "READY" || !g.videoKey) throw new AuthError(404, "Not Found");
    const total = await storage.size(g.videoKey);
    if (total === null) throw new AuthError(404, "Not Found");
    reply.header("accept-ranges", "bytes").header("cache-control", "private, no-store").type(g.videoType ?? "application/octet-stream");
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (!m) return reply.header("content-length", total).send(storage.read(g.videoKey));
    let start = m[1] === "" ? NaN : Number(m[1]);
    let end = m[2] === "" ? NaN : Number(m[2]);
    if (Number.isNaN(start) && Number.isNaN(end)) return reply.status(416).header("content-range", `bytes */${total}`).send();
    if (Number.isNaN(start)) { start = Math.max(0, total - end); end = total - 1; }
    else if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) return reply.status(416).header("content-range", `bytes */${total}`).send();
    return reply.status(206).header("content-range", `bytes ${start}-${end}/${total}`).header("content-length", end - start + 1)
      .send(storage.read(g.videoKey, { start, end }));
  });

  // Line the film up with the official scorebook.
  app.get("/api/v1/teams/:id/matches", { config: { access: view } }, async (req) => ({ items: await matchesOfTeam(db, idParam.parse(req.params).id) }));
  app.put("/api/v1/film/games/:id/match", { config: { access: manageGame } }, async (req, reply) => {
    const { matchId } = z.object({ matchId: z.uuid() }).parse(req.body);
    await linkMatch(db, idParam.parse(req.params).id, matchId);
    return reply.status(204).send();
  });
  app.delete("/api/v1/film/games/:id/match", { config: { access: manageGame } }, async (req, reply) => {
    await unlinkMatch(db, idParam.parse(req.params).id);
    return reply.status(204).send();
  });
  app.put("/api/v1/film/games/:id/sync", { config: { access: manageGame } }, async (req, reply) => {
    const body = z.object({ eventId: z.uuid(), videoMs: z.number().int().min(0) }).parse(req.body);
    await setSync(db, idParam.parse(req.params).id, body.eventId, body.videoMs);
    return reply.status(204).send();
  });
  app.get("/api/v1/film/games/:id/timeline", { config: { access: viewGame } }, async (req) => timeline(db, idParam.parse(req.params).id));

  app.get("/api/v1/film/games/:id/clips", { config: { access: viewGame } }, async (req) => {
    const { tag } = z.object({ tag: z.string().max(30).optional() }).parse(req.query);
    return { items: await listClips(db, idParam.parse(req.params).id, tag) };
  });
  app.post("/api/v1/film/games/:id/clips", { config: { access: manageGame } }, async (req, reply) => {
    const body = z.object({
      startMs: z.number().int().min(0), endMs: z.number().int().min(1),
      tags: z.array(z.string().max(60)).max(20).default([]), note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    return reply.status(201).send(await createClip(db, req.user!.id, idParam.parse(req.params).id, body));
  });
  app.delete("/api/v1/film/games/:id/clips/:clipId", { config: { access: manageGame } }, async (req, reply) => {
    const p = clipParam.parse(req.params);
    await deleteClip(db, p.id, p.clipId);
    return reply.status(204).send();
  });
}
