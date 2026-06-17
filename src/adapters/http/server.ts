import { createServer } from "node:http";
import { handleHttpRequest } from "./routes.ts";

const host = getArgValue("--host") ?? "127.0.0.1";
const port = Number(getArgValue("--port") ?? "3333");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid --port value: ${port}`);
}

const server = createServer((req, res) => {
  void handleHttpRequest(req, res);
});

server.listen(port, host, () => {
  console.log(`Mahjong AI HTTP API listening on http://${host}:${port}`);
});

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

