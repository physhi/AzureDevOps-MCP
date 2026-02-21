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

  constructor(private readonly credential: TokenCredential) {}

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
    await handler.ensureToken();
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
        const credential = new InteractiveBrowserCredential({
          ...credentialOptions,
          authenticationRecord: existingRecord,
        });
        // Attempt silent token acquisition (no browser)
        const token = await credential.getToken(AZURE_DEVOPS_SCOPE);
        if (token) {
          console.error(`[Auth] Silent authentication succeeded for "${label}".`);
          const handler = new TokenCredentialAuthHandler(credential);
          handler.token = token;
          handler.authHandler = azdev.getHandlerFromToken(token.token);
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
    await handler.ensureToken();
    return handler;
  }

  private isTokenExpired(): boolean {
    const currentTime = new Date().getTime();
    return this.token!.expiresOnTimestamp <= currentTime + 60000;
  }

  private async ensureToken() {
    if (!this.token || this.isTokenExpired()) {
      const token = await this.credential.getToken(AZURE_DEVOPS_SCOPE);
      if (!token) {
        throw new Error("Failed to acquire Azure DevOps access token.");
      }
      this.token = token;
      this.authHandler = azdev.getHandlerFromToken(this.token.token);
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
    if (this.authHandler) {
      return this.authHandler.canHandleAuthentication(response);
    }
    return response.message.statusCode === 401 &&
           (response.message.statusMessage || "").toLowerCase().indexOf("non-authoritative") === -1;
  }

  public async handleAuthentication(
    httpClient: VsoBaseInterfaces.IHttpClient,
    requestInfo: VsoBaseInterfaces.IRequestInfo,
    objs: any
  ): Promise<VsoBaseInterfaces.IHttpClientResponse> {
    await this.ensureToken();
    return this.authHandler!.handleAuthentication(
      httpClient,
      requestInfo,
      objs
    );
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
