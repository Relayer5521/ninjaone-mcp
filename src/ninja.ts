import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

interface Token {
  access_token: string;
  token_type: string; // "Bearer"
  expires_in: number; // seconds
  obtained_at: number; // epoch seconds
}

export class NinjaApiClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private scope?: string;
  private http: AxiosInstance;
  private token?: Token;
  private runscriptStyle: 'actions' | 'legacy';

  constructor(opts: { baseUrl: string; clientId: string; clientSecret: string; scope?: string; runscriptStyle?: 'actions' | 'legacy' }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.scope = opts.scope;
    this.runscriptStyle = opts.runscriptStyle ?? 'actions';
    this.http = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
  }

  private tokenFresh(): boolean {
    if (!this.token) return false;
    const now = Math.floor(Date.now() / 1000);
    // Refresh 60s early
    return now < this.token.obtained_at + this.token.expires_in - 60;
    }

  private async fetchToken(): Promise<void> {
    const url = `${this.baseUrl}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    if (this.scope) body.set("scope", this.scope);

    const { data } = await axios.post(url, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    });

    this.token = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      obtained_at: Math.floor(Date.now() / 1000),
    };
  }

  private async authed<T>(cfg: AxiosRequestConfig): Promise<T> {
    if (!this.tokenFresh()) await this.fetchToken();

    const doReq = async (attempt: number): Promise<T> => {
      try {
        const { data } = await this.http.request<T>({
          ...cfg,
          headers: {
            ...(cfg.headers || {}),
            Authorization: `Bearer ${this.token!.access_token}`,
          },
        });
        return data;
      } catch (err: any) {
        const status = err?.response?.status;
        // Retry on 429/5xx with exponential backoff (cap 5s)
        if ((status === 429 || (status >= 500 && status <= 599)) && attempt < 4) {
          const delay = Math.min(5000, 250 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, delay));
          return doReq(attempt + 1);
        }
        // If 401, force token refresh once
        if (status === 401 && attempt < 1) {
          await this.fetchToken();
          return doReq(attempt + 1);
        }
        throw err;
      }
    };

    return doReq(0);
  }

  // --- API convenience methods ---
  // Paths follow NinjaOne Public API v2.

  listOrganizations() {
    return this.authed<any>({ method: "GET", url: "/v2/organizations" });
  }

  listDevices(params?: { pageSize?: number; cursor?: string; df?: string }) {
    const q = new URLSearchParams();
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.cursor) q.set("cursor", params.cursor);
    if (params?.df) q.set("df", params.df); // device filter syntax
    const qs = q.toString();
    return this.authed<any>({ method: "GET", url: `/v2/devices${qs ? `?${qs}` : ""}` });
  }

  getDevice(deviceId: number | string) {
    return this.authed<any>({ method: "GET", url: `/v2/devices/${deviceId}` });
  }

  listAlerts(params?: { status?: string; pageSize?: number; cursor?: string }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.cursor) q.set("cursor", params.cursor);
    const qs = q.toString();
    return this.authed<any>({ method: "GET", url: `/v2/alerts${qs ? `?${qs}` : ""}` });
  }

  // --- Mutating endpoints ---
  /** Reset/close an alert (aka triggered condition). */
  resetAlert(uid: string, body?: { activity?: string; note?: string }) {
    if (body && (body.activity || body.note)) {
      return this.authed<any>({ method: 'POST', url: `/v2/alert/${encodeURIComponent(uid)}/reset`, data: body });
    }
    return this.authed<any>({ method: 'DELETE', url: `/v2/alert/${encodeURIComponent(uid)}` });
  }

  /** Run a script on a device. Two styles supported; choose with NINJA_RUNSCRIPT_STYLE. */
  runScript(deviceId: number | string, scriptId: number | string, params?: Record<string, any>, dryRun?: boolean) {
    const payloadActions = { type: 'RUN_SCRIPT', scriptId, parameters: params ?? {}, dryRun: !!dryRun };
    const payloadLegacy = { scriptId, parameters: params ?? {}, dryRun: !!dryRun };

    if (this.runscriptStyle === 'actions') {
      return this.authed<any>({ method: 'POST', url: `/v2/devices/${deviceId}/actions`, data: payloadActions });
    } else {
      return this.authed<any>({ method: 'POST', url: `/v2/device/${deviceId}/run/script`, data: payloadLegacy });
    }
  }
}

export function encodeDf(parts: Array<string | undefined | false>): string | undefined {
  const clauses = parts.filter(Boolean) as string[];
  if (!clauses.length) return undefined;
  const raw = clauses.join(" AND ");
  return encodeURIComponent(raw);
}
