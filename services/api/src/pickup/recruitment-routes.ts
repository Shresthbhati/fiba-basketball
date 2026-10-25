import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createScoutingInvite,
  getPickupScoutingRoster,
  getRecruitmentInvite,
  listAthleteInvites,
  listTeamOutgoingInvites,
  respondToInvite,
  type RecruitmentInviteStatus,
  type RecruitmentInviteType,
} from "./recruitment.js";

const idParam = z.object({ id: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });

const inviteTypeEnum = z.enum(["TRYOUT", "ROSTER_SPOT", "DEVELOPMENT_SQUAD"]);
const inviteStatusEnum = z.enum(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"]);

const createInviteBody = z.object({
  athleteId: z.string().uuid(),
  teamId: z.string().uuid(),
  inviteType: inviteTypeEnum.optional(),
  message: z.string().trim().min(5, "Message must be at least 5 characters").max(1000),
  tryoutDate: z.string().datetime().optional(),
  location: z.string().trim().max(200).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

const listInvitesQuery = z.object({
  status: inviteStatusEnum.optional(),
});

export function registerPickupRecruitment(app: FastifyInstance, db: Db) {
  // Coach: Scout a pickup participant and send recruitment invite
  app.post(
    "/api/v1/pickup/:id/scout-invites",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest, reply) => {
      const { id: pickupGameId } = idParam.parse(req.params);
      const body = createInviteBody.parse(req.body);

      const invite = await createScoutingInvite(db, req.user!, {
        pickupGameId,
        athleteId: body.athleteId,
        teamId: body.teamId,
        inviteType: body.inviteType as RecruitmentInviteType | undefined,
        message: body.message,
        tryoutDate: body.tryoutDate,
        location: body.location,
        expiresInDays: body.expiresInDays,
      });

      return reply.status(201).send(invite);
    },
  );

  // Coach: Get candidate scouting roster for a pickup run
  app.get(
    "/api/v1/pickup/:id/scouting-roster",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id: pickupGameId } = idParam.parse(req.params);
      return getPickupScoutingRoster(db, pickupGameId, req.user!.id);
    },
  );

  // Athlete: List incoming recruitment invites
  app.get(
    "/api/v1/recruitment/invites",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const query = listInvitesQuery.parse(req.query ?? {});
      const items = await listAthleteInvites(
        db,
        req.user!.id,
        query.status as RecruitmentInviteStatus | undefined,
      );
      return { items };
    },
  );

  // Single invite details (athlete or coach)
  app.get(
    "/api/v1/recruitment/invites/:id",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id } = idParam.parse(req.params);
      return getRecruitmentInvite(db, id, req.user!.id);
    },
  );

  // Athlete: Accept invite
  app.post(
    "/api/v1/recruitment/invites/:id/accept",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id } = idParam.parse(req.params);
      return respondToInvite(db, id, req.user!.id, "ACCEPT");
    },
  );

  // Athlete: Decline invite
  app.post(
    "/api/v1/recruitment/invites/:id/decline",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id } = idParam.parse(req.params);
      return respondToInvite(db, id, req.user!.id, "DECLINE");
    },
  );

  // Team: Outgoing recruitment invites sent by team
  app.get(
    "/api/v1/teams/:teamId/recruitment-invites",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { teamId } = teamIdParam.parse(req.params);
      const items = await listTeamOutgoingInvites(db, teamId, req.user!.id);
      return { items };
    },
  );
}
