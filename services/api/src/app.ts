import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // RFC 9457 problem+json for every error.
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode ?? 500;
    reply.status(status).type("application/problem+json").send({
      type: "about:blank",
      title: status >= 500 ? "Internal Server Error" : err.message,
      status,
      instance: req.url,
      requestId: req.id,
    });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).type("application/problem+json").send({
      type: "about:blank", title: "Not Found", status: 404, instance: req.url, requestId: req.id,
    });
  });

  app.get("/health", async () => ({ status: "UP" }));
  return app;
}
