# NinjaOne MCP Server (TypeScript)

A minimal, robust MCP server exposing read-only NinjaOne API tools.

## Environment
- **NINJA_BASE_URL**: Your region base (e.g., https://app.ninjarmm.com, https://eu.ninjarmm.com, https://oc.ninjarmm.com)
- **NINJA_CLIENT_ID / NINJA_CLIENT_SECRET**: From Admin → Apps → API → Client App IDs
- **NINJA_SCOPE**: Optional; leave empty if not required
- **READ_ONLY**: Defaults to `true`. Set `false` to enable mutating tools.
- **NINJA_RUNSCRIPT_STYLE**: `actions` (default) or `legacy`

## Tools
- `listOrganizations()`
- `listDevices({ pageSize?, cursor?, orgId?, status?, classIn?, online? })`
- `getDevice({ deviceId })`
- `listAlerts({ status?, pageSize?, cursor? })`
- `resetAlert({ uid, activity?, note? })` *(requires READ_ONLY=false)*
- `runScript({ deviceId, scriptId, parameters?, dryRun? })` *(requires READ_ONLY=false)*

## Device Filters (df)
We support a subset via builder. You can also supply raw df clauses by extending `src/server.ts`.

## Portainer / Docker deployment
### Compose
```yaml
version: "3.8"
services:
  ninjaone-mcp:
    image: ghcr.io/your-org/ninjaone-mcp:0.2
    container_name: ninjaone-mcp
    restart: unless-stopped
    env_file: [.env]
    environment:
      - NODE_ENV=production
      - PORT=3030
      - HOST=0.0.0.0
    ports:
      - "3030:3030"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3030/mcp" ]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### Docker run
```bash
docker run -d     --name ninjaone-mcp     -p 3030:3030     --restart unless-stopped     --env-file ./.env     ghcr.io/your-org/ninjaone-mcp:0.2
```

## MCP Client (Claude Desktop) config
```json
{
  "mcpServers": {
    "ninjaone": {
      "type": "http",
      "url": "http://127.0.0.1:3030/mcp",
      "alwaysAllow": true,
      "enabled": true
    }
  }
}
```
