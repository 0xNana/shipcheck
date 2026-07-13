import { setDefaultResultOrder } from "node:dns";
import { createServer, type Server } from "node:http";

// Railway has no IPv6 route to Supabase direct hosts; prefer A records.
setDefaultResultOrder("ipv4first");

function portFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env["PORT"] ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new TypeError(`Invalid PORT: ${env["PORT"] ?? "(unset)"}`);
  }
  return port;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const port = portFromEnv();
  const earlyServer = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "";
    if (path === "/health/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "live" }));
      return;
    }
    if (path === "/health/ready" || path === "/health") {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ status: "not_ready", checks: { boot: false } }),
      );
      return;
    }
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "starting" }));
  });

  await listen(earlyServer, port);
  console.log(
    JSON.stringify({ event: "server.liveness_bound", stage: "boot", port }),
  );

  try {
    const { startProductionServer } = await import("./server.js");
    await startProductionServer(process.env, { replaceServer: earlyServer });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: "server.boot_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    console.error(error);
    earlyServer.close();
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
