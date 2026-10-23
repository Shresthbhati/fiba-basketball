import { and, asc, count, eq } from "drizzle-orm";
import { can } from "../authz/service.js";
import { writeAudit } from "../audit/service.js";
import type { Db } from "../db/index.js";
import { competitionRosters, competitionTeams, competitions, roleAssignments, teams, users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { notify } from "../notifications/service.js";

export const MAX_ROSTER = 15;

type Viewer = { id: string };

/** What this person may do with a team's roster in a competition. Outsiders learn nothing (404). */
async function access(db: Db, viewer: Viewer, competitionId: string, teamId: string) {
  const [c] = await db.select().from(competitions).where(eq(competitions.id, competitionId));
  const [entry] = await db.select().from(competitionTeams).where(and(eq(competitionTeams.competitionId, competitionId), eq(competitionTeams.teamId, teamId)));
  if (!c || !entry) throw new AuthError(404, "Not Found");
  const organizer = await can(db, viewer.id, "competition:manage", { type: "competition", id: competitionId });
  const staff = await can(db, viewer.id, "film:manage", { type: "team", id: teamId });
  const member = staff || (await can(db, viewer.id, "team:view", { type: "team", id: teamId }));
  if (!organizer && !member) throw new AuthError(404, "Not Found");
  // Team staff can change the roster while registration is open; the organizer can until the competition is over.
  const canEdit = c.status !== "COMPLETED" && (organizer || (staff && c.status === "DRAFT"));
  return { competition: c, canEdit, organizer, staff };
}

export async function getRoster(db: Db, viewer: Viewer, competitionId: string, teamId: string) {
  const { canEdit } = await access(db, viewer, competitionId, teamId);
  const items = await db
    .select({ userId: users.id, name: users.displayName, jersey: competitionRosters.jersey })
    .from(competitionRosters)
    .innerJoin(users, eq(users.id, competitionRosters.userId))
    .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.teamId, teamId)))
    .orderBy(asc(competitionRosters.jersey));
  // Who could still be added: adult team members not on any roster in this competition. Only shown to people who can edit.
  const taken = new Set((await db.select({ userId: competitionRosters.userId }).from(competitionRosters).where(eq(competitionRosters.competitionId, competitionId))).map((r) => r.userId));
  const candidates = canEdit
    ? (await db.select({ userId: users.id, name: users.displayName, isMinor: users.isMinor }).from(roleAssignments)
        .innerJoin(users, eq(users.id, roleAssignments.userId))
        .where(and(eq(roleAssignments.resourceType, "team"), eq(roleAssignments.resourceId, teamId)))
        .orderBy(asc(users.displayName))).filter((u) => !u.isMinor && !taken.has(u.userId)).map(({ userId, name }) => ({ userId, name }))
    : [];
  return { items, canEdit, max: MAX_ROSTER, candidates };
}

export async function setRosterSpot(db: Db, actor: Viewer, competitionId: string, teamId: string, userId: string, jersey: number) {
  const { competition, canEdit } = await access(db, actor, competitionId, teamId);
  if (!canEdit) throw new AuthError(409, competition.status === "COMPLETED" ? "The competition is over; rosters are closed" : "Rosters are closed. Ask the organizer to make changes");

  const [player] = await db.select().from(users).where(eq(users.id, userId));
  const [member] = await db.select({ id: roleAssignments.id }).from(roleAssignments)
    .where(and(eq(roleAssignments.userId, userId), eq(roleAssignments.resourceType, "team"), eq(roleAssignments.resourceId, teamId)));
  if (!player || !member) throw new AuthError(409, "Only people on the team can be added to its roster");
  if (player.isMinor) throw new AuthError(409, "Under-18 players cannot be added to competition rosters yet");

  const [elsewhere] = await db.select({ teamId: competitionRosters.teamId }).from(competitionRosters)
    .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.userId, userId)));
  if (elsewhere && elsewhere.teamId !== teamId) throw new AuthError(409, "This player is already on another team's roster in this competition");

  const [taken] = await db.select({ userId: competitionRosters.userId }).from(competitionRosters)
    .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.teamId, teamId), eq(competitionRosters.jersey, jersey)));
  if (taken && taken.userId !== userId) throw new AuthError(409, `Jersey number ${jersey} is already taken on this team`);

  if (!elsewhere) {
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(competitionRosters)
      .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.teamId, teamId)));
    if (n >= MAX_ROSTER) throw new AuthError(409, `A roster can have at most ${MAX_ROSTER} players`);
    await db.insert(competitionRosters).values({ competitionId, teamId, userId, jersey, addedBy: actor.id });
    const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId));
    await notify(db, [userId], { kind: "ADDED_TO_ROSTER", title: `You are on ${t?.name ?? "the team"}'s roster for ${competition.name}`, link: `/competitions/${competitionId}` });
    await writeAudit(db, { actorId: actor.id, action: "roster.added", resourceType: "competition", resourceId: competitionId, metadata: { teamId, userId, jersey } });
  } else {
    await db.update(competitionRosters).set({ jersey })
      .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.userId, userId)));
    await writeAudit(db, { actorId: actor.id, action: "roster.jersey_changed", resourceType: "competition", resourceId: competitionId, metadata: { teamId, userId, jersey } });
  }
}

export async function removeRosterSpot(db: Db, actor: Viewer, competitionId: string, teamId: string, userId: string) {
  const { competition, canEdit } = await access(db, actor, competitionId, teamId);
  if (!canEdit) throw new AuthError(409, competition.status === "COMPLETED" ? "The competition is over; rosters are closed" : "Rosters are closed. Ask the organizer to make changes");
  const gone = await db.delete(competitionRosters)
    .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.teamId, teamId), eq(competitionRosters.userId, userId)))
    .returning({ userId: competitionRosters.userId });
  if (gone.length === 0) throw new AuthError(404, "Not Found");
  await writeAudit(db, { actorId: actor.id, action: "roster.removed", resourceType: "competition", resourceId: competitionId, metadata: { teamId, userId } });
}
