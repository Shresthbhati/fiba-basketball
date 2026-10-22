import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import type { Action, ResourceRef } from "./policy.js";
import { can } from "./service.js";

export type Access =
  | "public"
  | "authenticated"
  | { action: Action; resource?: (req: FastifyRequest) => ResourceRef | undefined | Promise<ResourceRef | undefined>; hide?: boolean };

declare module "fastify" {
  interface FastifyContextConfig {
    access?: Access;
  }
}

/**
 * Every /api/v1 route MUST declare `config: { access }`. Registration throws otherwise, so a route
 * can never ship without an explicit authorization decision. Unauthorized private resources
 * (`hide: true`) answer 404 so their existence is not revealed.
 */
export function enforceAccess(app: FastifyInstance, db: Db) {
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1")) return;
    const access = route.config?.access;
    if (access === undefined) throw new Error(`Route ${route.method} ${route.url} must declare config.access`);
    if (access === "public") return;

    const pre = async (req: FastifyRequest) => {
      if (!req.user) throw new AuthError(401, "Not signed in");
      if (access === "authenticated") return;
      const ok = await can(db, req.user.id, access.action, await access.resource?.(req));
      if (!ok) throw new AuthError(access.hide ? 404 : 403, access.hide ? "Not Found" : "Forbidden");
    };
    const existing = route.preHandler;
    route.preHandler = [pre, ...(Array.isArray(existing) ? existing : existing ? [existing] : [])] as never;
  });
}
