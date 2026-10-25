#!/usr/bin/env node
// Minimal stdio <-> HTTP JSON-RPC bridge for a Paperclip MCP gateway.
//
// Why this exists: OpenCode's remote-MCP client only speaks the old HTTP+SSE transport
// and rejects Paperclip's JSON gateway, so it is given this local stdio server instead.
// Reads newline-delimited JSON-RPC on stdin, POSTs each message to the gateway, writes
// the reply back on stdout. Any CLI agent that supports stdio MCP works through it.
//
// Configured via env so the run token never appears in argv:
//   MCP_HTTP_URL    full gateway endpoint, e.g. http://127.0.0.1:3110/mcp/gateways/gw_x
//   MCP_HTTP_TOKEN  run-scoped bearer token
//   MCP_DEBUG_LOG   optional path; appends every IN/OUT message when set

import fs from "node:fs";

const url = process.env.MCP_HTTP_URL;
const token = process.env.MCP_HTTP_TOKEN;
const debugLog = process.env.MCP_DEBUG_LOG;

if (!url || !token) {
  process.stderr.write("mcp-stdio-bridge: MCP_HTTP_URL and MCP_HTTP_TOKEN are required\n");
  process.exit(1);
}

let buffer = "";
let pending = 0;
let stdinEnded = false;
// Serialise forwards: MCP expects initialize to complete before tools/list, and replies
// must stay in request order.
let chain = Promise.resolve();

function debug(direction, value) {
  if (!debugLog) return;
  try {
    fs.appendFileSync(debugLog, direction + " " + JSON.stringify(value) + "\n");
  } catch {
    /* debugging must never break the bridge */
  }
}

function maybeExit() {
  if (stdinEnded && pending === 0) process.exit(0);
}

function send(payload) {
  debug("OUT", payload);
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function forward(message) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(message),
  });
  const text = await res.text();
  if (!text.trim()) return null;
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      const match = /^data:\s*(.+)$/.exec(line);
      if (match) return JSON.parse(match[1]);
    }
    return null;
  }
  return JSON.parse(text);
}

// OpenCode validates tool names against a strict charset and drops the whole server
// when one fails (`Failed to get tools`). Paperclip names gateway tools
// `mcp.<connection-uid>:<tool>`, so rewrite them to a safe form and translate back on
// tools/call.
const sanitized = new Map();
const reverse = new Map();

function sanitize(name) {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  sanitized.set(safe, name);
  reverse.set(name, safe);
  return safe;
}

function rewriteToolsResult(message) {
  const tools = message?.result?.tools;
  if (!Array.isArray(tools)) return message;
  return {
    ...message,
    result: {
      ...message.result,
      tools: tools.map((tool) =>
        typeof tool?.name === "string"
          ? {
              ...tool,
              name: sanitize(tool.name),
              // MCP requires an object schema; Paperclip sends {} for connections whose
              // tool has no declared parameters, and OpenCode drops the server over it.
              inputSchema:
                tool.inputSchema && typeof tool.inputSchema === "object" && "type" in tool.inputSchema
                  ? tool.inputSchema
                  : { type: "object", properties: {} },
            }
          : tool,
      ),
    },
  };
}

function rewriteToolCall(message) {
  const name = message?.params?.name;
  if (typeof name !== "string") return message;
  const original = sanitized.get(name);
  if (!original) return message;
  return { ...message, params: { ...message.params, name: original } };
}

async function handle(message) {
  const id = message.id;
  const expectsReply = id !== undefined && id !== null;
  pending += 1;
  try {
    const outgoing = message.method === "tools/call" ? rewriteToolCall(message) : message;
    let reply = await forward(outgoing);
    if (reply && message.method === "tools/list") reply = rewriteToolsResult(reply);
    if (expectsReply && reply) send(reply);
  } catch (err) {
    if (expectsReply) {
      send({
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32603,
          message: "bridge: " + (err instanceof Error ? err.message : String(err)),
        },
      });
    }
  } finally {
    pending -= 1;
    maybeExit();
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stderr.write("mcp-stdio-bridge: dropping non-JSON line\n");
      continue;
    }
    debug("IN", message);
    chain = chain.then(() => handle(message));
  }
});

process.stdin.on("end", () => {
  // Let queued forwards finish before exiting, otherwise the last reply is lost.
  chain.finally(() => {
    stdinEnded = true;
    maybeExit();
  });
});
