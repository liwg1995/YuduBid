// OrcaRouter credential and login types shared by the renderer bridge.
//
// The API key itself is deliberately absent from every type here: the
// credential lives in Main (userData/user_config.json) and the renderer only
// ever sees account state and a redacted hint.

// `auto` binds a loopback listener and falls back to the out-of-band code when
// no port can be bound. `loopback` and `oob` force one flow, for tests.
export type OrcaLoginFlow = 'auto' | 'loopback' | 'oob';

export type OrcaCredentialStatus = 'unconfigured' | 'active' | 'needsReauth';

export interface OrcaOrigins {
  authBaseUrl: string;
  apiBaseUrl: string;
  keyConsoleUrl: string;
  keyDashboardUrl: string;
  logoUrl: string;
}

export interface OrcaStatus {
  configured: boolean;
  status: OrcaCredentialStatus;
  /** `api-key` when pasted, `pkce` when issued by the browser login. */
  source: '' | 'api-key' | 'pkce';
  accountId: string;
  scope: string;
  /** Increments on every successful acquisition; stale 401s compare against it. */
  generation: number;
  issuedAt: string;
  redactedKey: string;
  origins: OrcaOrigins;
  loginInProgress: boolean;
  loginAttemptId: string;
}

export interface OrcaCredentialSummary {
  success: boolean;
  accountId: string;
  source: 'api-key' | 'pkce';
  redactedKey: string;
}

export interface OrcaLoginStart {
  attemptId: string;
  mode: 'loopback' | 'oob';
  /** Open this in a browser; it contains the S256 challenge, never the verifier. */
  authorizeUrl: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  keyConsoleUrl: string;
}

export interface OrcaLoginResultEvent {
  attemptId: string;
  result: { accountId: string; scope: string; scopeDowngraded: boolean } | null;
  error: { code: string; message: string } | null;
}

export interface OrcaSubmitCodeResult {
  success: boolean;
  accountId?: string;
  scope?: string;
  code?: string;
  message?: string;
}

// One catalog record, as returned by the model-discovery IPC. Only these
// fields cross the bridge — never the credential that fetched them.
export interface OrcaCatalogModel {
  id: string;
  name: string;
  contextLength?: number;
  maxOutputTokens?: number;
  endpointTypes: string[];
  inputModalities: string[];
  outputModalities: string[];
  reasoning: boolean;
  reasoningEfforts: string[];
}

export type OrcaModelCapability = 'chat' | 'embedding' | 'image' | 'video' | 'rerank';

export interface OrcaModelCatalogResult {
  success: boolean;
  message: string;
  models: string[];
  catalog: OrcaCatalogModel[];
  /** `remote` when live discovery answered, `seed` when the verified fallback did. */
  source: 'remote' | 'seed';
  degraded: boolean;
  capability: OrcaModelCapability;
}
