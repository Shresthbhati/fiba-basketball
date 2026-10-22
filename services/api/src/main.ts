import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const { PORT } = loadConfig();
await buildApp().listen({ port: PORT, host: "0.0.0.0" });
