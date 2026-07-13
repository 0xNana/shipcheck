import { startFixtureServer } from "./server.js";

const server = await startFixtureServer();
console.log(`fixture server listening on ${server.origin}`);

process.on("SIGINT", () => {
  void server.close().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void server.close().finally(() => process.exit(0));
});
