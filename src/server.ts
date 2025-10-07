// @ts-nocheck
import "dotenv/config";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { NinjaApiClient, encodeDf } from "./ninja.js";

const PORT = parseInt(process.env.PORT || "3030", 10);
const HOST = process.env.HOST || "127.0.0.1";

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
};

const ninja = new NinjaApiClient({
  baseUrl: required("NINJA_BASE_URL"),
  clientId: required("NINJA_CLIENT_ID"),
  clientSecret: required("NINJA_CLIENT_SECRET"),
  scope: process.env.NINJA_SCOPE,
  runscriptStyle: (process.env.NINJA_RUNSCRIPT_STYLE as any) || 'actions',
});

const server = new McpServer({ name: "ninjaone-mcp", version: "0.2.0" });

// --- Tools ---
server.tool("listOrganizations", {
  description: "List organizations visible to this API client.",
  inputSchema: z.object({}).strict(),
  handler: async () => {
    const data = await ninja.listOrganizations();
    return { content: [{ type: "json", data }] };
  },
});

server.tool("listDevices", {
  description: "List devices; optional filters via NinjaOne device filter syntax (df).",
  inputSchema: z
    .object({
      pageSize: z.number().int().positive().max(500).optional(),
      cursor: z.string().optional(),
      orgId: z.union([z.string(), z.number()]).optional().describe("Filter by organization id"),
      status: z.enum(["APPROVED", "PENDING", "DECOMMISSIONED"]).optional(),
      classIn: z.array(z.enum(["WINDOWS_WORKSTATION", "WINDOWS_SERVER", "MAC", "LINUX_WORKSTATION", "LINUX_SERVER"]).optional()).optional(),
      online: z.boolean().optional(),
    })
    .strict(),
  handler: async ({ input }) => {
    const df = encodeDf([
      input.orgId ? `org = ${input.orgId}` : undefined,
      input.status ? `status eq ${input.status}` : undefined,
      input.classIn?.length ? `class in (${input.classIn.join(",")})` : undefined,
      typeof input.online === "boolean" ? (input.online ? "online" : "offline") : undefined,
    ]);
    const data = await ninja.listDevices({ pageSize: input.pageSize, cursor: input.cursor, df });
    return { content: [{ type: "json", data }] };
  },
});

server.tool("getDevice", {
  description: "Get a single device by id.",
  inputSchema: z.object({ deviceId: z.union([z.number().int(), z.string()]) }).strict(),
  handler: async ({ input }) => {
    const data = await ninja.getDevice(input.deviceId);
    return { content: [{ type: "json", data }] };
  },
});

server.tool("listAlerts", {
  description: "List alerts; filter by status (e.g., OPEN, CLOSED).",
  inputSchema: z
    .object({ pageSize: z.number().int().positive().max(500).optional(), cursor: z.string().optional(), status: z.string().optional() })
    .strict(),
  handler: async ({ input }) => {
    const data = await ninja.listAlerts({ pageSize: input.pageSize, cursor: input.cursor, status: input.status });
    return { content: [{ type: "json", data }] };
  },
});

// --- Mutating tools (v0.2). Protected by READ_ONLY env. ---
const assertWritable = () => {
  if ((process.env.READ_ONLY ?? 'true').toLowerCase() !== 'false') {
    throw new Error('Mutating tools are disabled. Set READ_ONLY=false to enable.');
  }
};

server.tool("resetAlert", {
  description: "Reset/close an alert (triggered condition) by uid. If activity/note provided, uses POST /v2/alert/{uid}/reset.",
  inputSchema: z
    .object({
      uid: z.string(),
      activity: z.string().optional(),
      note: z.string().optional(),
    })
    .strict(),
  handler: async ({ input }) => {
    assertWritable();
    const body = input.activity || input.note ? { activity: input.activity, note: input.note } : undefined;
    const data = await ninja.resetAlert(input.uid, body as any);
    return { content: [{ type: "json", data }] };
  },
});

server.tool("runScript", {
  description: "Run a script on a device. Honors NINJA_RUNSCRIPT_STYLE=actions|legacy. Set dryRun=true to simulate.",
  inputSchema: z
    .object({
      deviceId: z.union([z.number().int(), z.string()]),
      scriptId: z.union([z.number().int(), z.string()]),
      parameters: z.record(z.any()).default({}).optional(),
      dryRun: z.boolean().default(true).optional(),
    })
    .strict(),
  handler: async ({ input }) => {
    assertWritable();
    const data = await ninja.runScript(input.deviceId, input.scriptId, input.parameters, input.dryRun);
    return { content: [{ type: "json", data }] };
  },
});

// --- HTTP transport ---
const app = express();
const transport = new StreamableHTTPServerTransport(app);

await server.connect(transport);

app.listen(PORT, HOST, () => {
  console.log(`MCP HTTP server listening on http://${HOST}:${PORT}/mcp`);
});
