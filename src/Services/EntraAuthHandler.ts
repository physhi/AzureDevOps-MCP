import {
  AccessToken,
  DefaultAzureCredential,
  AzureCliCredential,
  InteractiveBrowserCredential,
  TokenCredential,
  AuthenticationRecord,
  serializeAuthenticationRecord,
  deserializeAuthenticationRecord,
} from "@azure/identity";
import { useIdentityPlugin } from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import * as VsoBaseInterfaces from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import * as azdev from "azure-devops-node-api";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Enable persistent token cache (encrypted via DPAPI on Windows, Keychain on macOS, libsecret on Linux)
try {
  useIdentityPlugin(cachePersistencePlugin);
} catch {
  // Plugin may already be registered or unavailable - continue without persistence
}

/**
 * Azure DevOps scope for token requests.
 */
const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

/** Shared token cache options - enables silent re-auth on subsequent starts. */
const TOKEN_CACHE_OPTIONS = { enabled: true };

// --- AuthenticationRecord persistence helpers ---

/** Derive a filesystem-safe label from the org URL (e.g. "dev.azure.com/myorg" → "dev.azure.com-myorg"). */
function orgUrlToLabel(): string {
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || "default";
  return orgUrl.replace(/^https?:\/\//, "").replace(/[/\\:*?"<>|]+/g, "-").replace(/-+$/, "");
}

function getAuthRecordDir(): string {
  return path.join(os.homedir(), ".azuredevops-mcp");
}

function getAuthRecordPath(label: string): string {
  return path.join(getAuthRecordDir(), `auth-record-${label}.json`);
}

function loadAuthRecord(label: string): AuthenticationRecord | undefined {
  try {
    const filePath = getAuthRecordPath(label);
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, "utf-8");
    return deserializeAuthenticationRecord(raw);
  } catch {
    return undefined;
  }
}

function saveAuthRecord(label: string, record: AuthenticationRecord): void {
  try {
    const dir = getAuthRecordDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getAuthRecordPath(label), serializeAuthenticationRecord(record), "utf-8");
  } catch (err) {
    console.error(`[Auth] Failed to save auth record for "${label}":`, err);
  }
}

/** Persist the bearer token to a shared file so external scripts/skills can use it. */
function saveAccessToken(label: string, token: AccessToken): void {
  try {
    const dir = getAuthRecordDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tokenPath = path.join(dir, `access-token-${label}.json`);
    fs.writeFileSync(tokenPath, JSON.stringify({
      accessToken: token.token,
      expiresOnTimestamp: token.expiresOnTimestamp,
      orgUrl: process.env.AZURE_DEVOPS_ORG_URL || "",
      project: process.env.AZURE_DEVOPS_PROJECT || "",
    }), "utf-8");
  } catch (err) {
    console.error(`[Auth] Failed to save access token for "${label}":`, err);
  }
}

function deleteAuthRecord(label: string): void {
  try {
    const filePath = getAuthRecordPath(label);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

/**
 * Generic auth handler that wraps any @azure/identity TokenCredential.
 * Supports automatic token refresh and re-authentication on 401.
 */
export class TokenCredentialAuthHandler implements IRequestHandler {
  private token: AccessToken | undefined;
  private authHandler: IRequestHandler | undefined;
  private credential: TokenCredential;
  private refreshTimer?: ReturnType<typeof setInterval>;

  /** Stored so ensureToken() can rebuild the credential on refresh failure (self-heal). */
  private authRecordLabel?: string;
  private credentialOptions?: ConstructorParameters<typeof InteractiveBrowserCredential>[0];

  constructor(credential: TokenCredential) {
    this.credential = credential;
  }

  /**
   * Create handler using InteractiveBrowserCredential with persistent token cache.
   * First run opens a browser for login; subsequent runs use the cached token silently.
   */
  public static async createEntra(): Promise<TokenCredentialAuthHandler> {
    return TokenCredentialAuthHandler.createWithAuthRecord(orgUrlToLabel(), {
      redirectUri: "http://localhost",
      tokenCachePersistenceOptions: TOKEN_CACHE_OPTIONS,
    });
  }

  /**
   * Create handler from AzureCliCredential.
   */
  public static async createAzureCli(tenantId?: string): Promise<TokenCredentialAuthHandler> {
    const credential = new AzureCliCredential(tenantId ? { tenantId } : undefined);
    const handler = new TokenCredentialAuthHandler(credential);
    handler.authRecordLabel = orgUrlToLabel();
    await handler.ensureToken();
    handler.startProactiveRefresh();
    return handler;
  }

  /**
   * Create handler from InteractiveBrowserCredential (MSAL).
   * Opens a browser window for user login with token caching and silent re-auth.
   */
  public static async createInteractive(options?: { tenantId?: string; clientId?: string }): Promise<TokenCredentialAuthHandler> {
    return TokenCredentialAuthHandler.createWithAuthRecord(orgUrlToLabel(), {
      ...(options?.tenantId && { tenantId: options.tenantId }),
      ...(options?.clientId && { clientId: options.clientId }),
      redirectUri: "http://localhost",
      tokenCachePersistenceOptions: TOKEN_CACHE_OPTIONS,
    });
  }

  /**
   * Shared helper: attempts silent auth with a saved AuthenticationRecord,
   * falls back to interactive browser login and persists the new record.
   */
  private static async createWithAuthRecord(
    label: string,
    credentialOptions: ConstructorParameters<typeof InteractiveBrowserCredential>[0],
  ): Promise<TokenCredentialAuthHandler> {
    // 1. Try loading a previously saved AuthenticationRecord
    const existingRecord = loadAuthRecord(label);
    if (existingRecord) {
      try {
        // Probe with disableAutomaticAuthentication to prevent browser popup.
        // If the refresh token is expired, this throws AuthenticationRequiredError
        // instead of silently opening a browser.
        const probe = new InteractiveBrowserCredential({
          ...credentialOptions,
          authenticationRecord: existingRecord,
          disableAutomaticAuthentication: true,
        });
        const token = await probe.getToken(AZURE_DEVOPS_SCOPE);
        if (token) {
          console.error(`[Auth] Silent authentication succeeded for "${label}".`);
          // Create the REAL credential WITHOUT disableAutomaticAuthentication
          // so that ensureToken() can silently refresh during the server's lifetime.
          const credential = new InteractiveBrowserCredential({
            ...credentialOptions,
            authenticationRecord: existingRecord,
          });
          const handler = new TokenCredentialAuthHandler(credential);
          handler.authRecordLabel = label;
          handler.credentialOptions = credentialOptions;
          handler.token = token;
          handler.authHandler = azdev.getHandlerFromToken(token.token);
          saveAccessToken(label, token);
          handler.startProactiveRefresh();
          return handler;
        }
      } catch {
        // Silent auth failed — stale record, token revoked, etc.
        console.error(`[Auth] Silent auth failed for "${label}", falling back to interactive login.`);
        deleteAuthRecord(label);
      }
    }

    // 2. No valid cached record — do interactive browser login
    const credential = new InteractiveBrowserCredential(credentialOptions);
    const authRecord = await credential.authenticate(AZURE_DEVOPS_SCOPE);
    if (authRecord) {
      saveAuthRecord(label, authRecord);
      console.error(`[Auth] Authentication record saved for "${label}".`);
    }

    const handler = new TokenCredentialAuthHandler(credential);
    handler.authRecordLabel = label;
    handler.credentialOptions = credentialOptions;
    await handler.ensureToken();
    handler.startProactiveRefresh();
    return handler;
  }

  private isTokenExpired(): boolean {
    const currentTime = new Date().getTime();
    return this.token!.expiresOnTimestamp <= currentTime + 60000;
  }

  private async ensureToken() {
    if (!this.token || this.isTokenExpired()) {
      try {
        const token = await this.credential.getToken(AZURE_DEVOPS_SCOPE);
        if (!token) throw new Error("getToken returned null");
        this.token = token;
        this.authHandler = azdev.getHandlerFromToken(this.token.token);
        if (this.authRecordLabel) saveAccessToken(this.authRecordLabel, token);
      } catch (err) {
        // Self-heal: rebuild credential from saved auth record (same as a restart).
        if (this.authRecordLabel && this.credentialOptions) {
          console.error(`[Auth] Token refresh failed, attempting self-heal for "${this.authRecordLabel}"...`);
          const record = loadAuthRecord(this.authRecordLabel);
          if (record) {
            const freshCredential = new InteractiveBrowserCredential({
              ...this.credentialOptions,
              authenticationRecord: record,
            });
            const token = await freshCredential.getToken(AZURE_DEVOPS_SCOPE);
            if (token) {
              console.error(`[Auth] Self-heal succeeded for "${this.authRecordLabel}".`);
              this.credential = freshCredential;
              this.token = token;
              this.authHandler = azdev.getHandlerFromToken(token.token);
              saveAccessToken(this.authRecordLabel, token);
              return;
            }
          }
        }
        throw new Error(`Failed to acquire Azure DevOps access token: ${err}`);
      }
    }
  }

  /**
   * Start a background timer that refreshes the token before it expires.
   * Default interval: 45 minutes (Azure AD tokens typically last 60-90 min).
   */
  public startProactiveRefresh(intervalMs: number = 45 * 60 * 1000): void {
    this.stopProactiveRefresh();
    this.refreshTimer = setInterval(async () => {
      try {
        this.token = undefined;
        await this.ensureToken();
        console.error(`[Auth] Proactive token refresh succeeded.`);
      } catch (err) {
        console.error(`[Auth] Proactive token refresh failed:`, err);
      }
    }, intervalMs);
    // Don't keep the Node process alive just for this timer
    if (this.refreshTimer && typeof this.refreshTimer === 'object' && 'unref' in this.refreshTimer) {
      this.refreshTimer.unref();
    }
  }

  /**
   * Force-clear the cached token and acquire a fresh one.
   * Used by the service-layer withAuthRetry() wrapper.
   */
  public async forceRefresh(): Promise<void> {
    this.token = undefined;
    await this.ensureToken();
  }

  public stopProactiveRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  public prepareRequest(options: VsoBaseInterfaces.IRequestOptions): void {
    if (this.authHandler) {
      this.authHandler.prepareRequest(options);
    }
  }

  public canHandleAuthentication(
    response: VsoBaseInterfaces.IHttpClientResponse
  ): boolean {
    // Don't delegate to inner BearerCredentialHandler — it always returns false.
    // Handle 401/403 directly so the HttpClient invokes handleAuthentication() for retry.
    const statusCode = response.message?.statusCode;
    return statusCode === 401 || statusCode === 403;
  }

  public async handleAuthentication(
    httpClient: VsoBaseInterfaces.IHttpClient,
    requestInfo: VsoBaseInterfaces.IRequestInfo,
    objs: any
  ): Promise<VsoBaseInterfaces.IHttpClientResponse> {
    // Force a fresh token (old one triggered 401/403)
    this.token = undefined;
    await this.ensureToken();

    // Apply fresh auth headers to the retried request
    if (this.authHandler) {
      this.authHandler.prepareRequest(requestInfo.options);
    }

    // Retry the original request with refreshed credentials
    return httpClient.requestRaw(requestInfo, objs);
  }
}

/**
 * @deprecated Use TokenCredentialAuthHandler.createEntra() instead.
 * Kept for backward compatibility.
 */
export class EntraAuthHandler extends TokenCredentialAuthHandler {
  private static instance: EntraAuthHandler;

  private constructor() {
    super(new DefaultAzureCredential());
  }

  public static async getInstance(): Promise<EntraAuthHandler> {
    if (!EntraAuthHandler.instance) {
      EntraAuthHandler.instance = new EntraAuthHandler();
    }
    // Ensure initial token is acquired
    await (EntraAuthHandler.instance as any).ensureToken();
    return EntraAuthHandler.instance;
  }
}
