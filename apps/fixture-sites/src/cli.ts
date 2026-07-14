import { startFixtureServer } from "./server.js";

const https = process.argv.includes("--https");
const server = await startFixtureServer({ https });
console.log(`fixture server listening on ${server.origin}`);

process.on("SIGINT", () => {
  void server.close().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void server.close().finally(() => process.exit(0));
});
