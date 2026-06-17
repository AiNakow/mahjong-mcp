import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import test from "node:test";
import { buildOpenApiDocument } from "../src/adapters/http/openapi.ts";
import { dispatchPost, handleHttpRequest } from "../src/adapters/http/routes.ts";

test("OpenAPI document exposes v1 mahjong paths", () => {
  const doc = buildOpenApiDocument();
  assert.equal(doc.openapi, "3.1.0");
  assert.ok(doc.paths["/v1/mahjong/choose-action"]);
  assert.ok(doc.components.schemas.GameState);
});

test("HTTP route dispatcher calls facade and marks source", () => {
  const result = dispatchPost("/v1/mahjong/nanikiru", { text: "3456m3455p123788s" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.meta.source, "http");
    assert.ok((result.data as { recommendation?: string }).recommendation);
  }
});

test("HTTP route dispatcher returns service failure for invalid input", () => {
  const result = dispatchPost("/v1/mahjong/analyze-hand", { text: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_input");
  }
});

test("HTTP server handles health, OpenAPI and POST requests", async () => {
  const server = createServer((req, res) => {
    void handleHttpRequest(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, "string");
    const serverAddress = address as AddressInfo;
    const baseUrl = `http://127.0.0.1:${serverAddress.port}`;

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json() as { ok: boolean };
    assert.equal(healthBody.ok, true);

    const openapi = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(openapi.status, 200);
    const openapiBody = await openapi.json() as { openapi: string };
    assert.equal(openapiBody.openapi, "3.1.0");

    const nanikiru = await fetch(`${baseUrl}/v1/mahjong/nanikiru`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "3456m3455p123788s", options: { useEvDecision: false } }),
    });
    assert.equal(nanikiru.status, 200);
    const nanikiruBody = await nanikiru.json() as { ok: boolean; meta?: { source: string } };
    assert.equal(nanikiruBody.ok, true);
    assert.equal(nanikiruBody.meta?.source, "http");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
