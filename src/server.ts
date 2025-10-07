import express, { type Request, type Response } from "express";
import { NinjaApiClient, encodeDf } from "./ninja";

// ----------------------------
// Config from environment
// ----------------------------
const PORT = Number(process.env.PORT ?? 3030);

const NINJA_BASE_URL = (process.env.NINJA_BASE_URL ?? "https://api.ninjaone.com").trim();
const NINJA_CLIENT_ID = (process.env.NINJA_CLIENT_ID ?? "").trim();
const NINJA_CLIENT_SECRET = (process.env.NINJA_CLIENT_SECRET ?? "").trim();
const NINJA_SCOPE = (process.env.NINJA_SCOPE ?? "api").trim();
const NINJA_RUNSCRIPT_STYLE =
  ((process.env.NINJA_RUNSCRIPT_STYLE ?? "actions").trim() as "actions" | "legacy");

// Read-only by default. Set READ_ONLY=false to allow mutating endpoints.
const READ_ONLY = String(process.env.READ_ONLY ?? "true").toLowerCase() !== "false";

function assertWritable(): void {
  if (READ_ONLY) {
    throw new Error("Mutating endpoints are disabled. Set READ_ONLY=false to enable.");
  }
}

// ----------------------------
// Ninja client
// ----------------------------
const ninja = new NinjaApiClient({
  baseUrl: NINJA_BASE_URL,
  clientId: NINJA_CLIENT_ID,
  clientSecret: NINJA_CLIENT_SECRET,
  scope: NINJA_SCOPE,
  runscriptStyle: NINJA_RUNSCRIPT_STYLE,
});

// ----------------------------
// Express app
// ----------------------------
const app = express();
app.use(express.json());

// Health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, name: "ninjaone-mcp", version: "0.2.0", readOnly: READ_ONLY });
});

// List organizations
app.get("/orgs", async (_req: Request, res: Response) => {
  try {
    const data = await ninja.listOrganizations();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// List devices with optional filters (query params)
app.get("/devices", async (req: Request, res: Response) => {
  try {
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const orgId = req.query.orgId ? String(req.query.orgId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const classIn =
      typeof req.query.classIn === "string"
        ? String(req.query.classIn)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const online =
      typeof req.query.online === "string"
        ? /^(true|1|yes)$/i.test(String(req.query.online))
        : undefined;

    const df = encodeDf([
      orgId ? `org = ${orgId}` : undefined,
      status ? `status eq ${status}` : undefined,
      classIn && classIn.length ? `class in (${classIn.join(",")})` : undefined,
      typeof online === "boolean" ? (online ? "online" : "offline") : undefined,
    ]);

    const data = await ninja.listDevices({ pageSize, cursor, df });
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Get a single device
app.get("/devices/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await ninja.getDevice(id);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// List alerts
app.get("/alerts", async (req: Request, res: Response) => {
  try {
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const data = await ninja.listAlerts({ pageSize, cursor, status });
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Reset / close alert (mutating)
app.post("/alerts/:uid/reset", async (req: Request, res: Response) => {
  try {
    assertWritable();
    const uid = req.params.uid;
    const body = req.body as { activity?: string; note?: string } | undefined;
    const data = await ninja.resetAlert(uid, body);
    res.json(data);
  } catch (err: unknown) {
    const code = READ_ONLY ? 403 : 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(code).json({ error: message });
  }
});

// Run script on a device (mutating)
app.post("/scripts/run", async (req: Request, res: Response) => {
  try {
    assertWritable();
    const body = (req.body ?? {}) as {
      deviceId: number | string;
      scriptId: number | string;
      parameters?: Record<string, unknown>;
      dryRun?: boolean;
    };
    const data = await ninja.runScript(
      body.deviceId,
      body.scriptId,
      body.parameters ?? {},
      Boolean(body.dryRun ?? true)
    );
    res.json(data);
  } catch (err: unknown) {
    const code = READ_ONLY ? 403 : 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(code).json({ error: message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ REST server up on http://localhost:${PORT}`);
  console.log(`   READ_ONLY=${READ_ONLY}  base=${NINJA_BASE_URL}  style=${NINJA_RUNSCRIPT_STYLE}`);
});
