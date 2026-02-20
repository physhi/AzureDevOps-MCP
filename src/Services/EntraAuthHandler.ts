import { AccessToken, DefaultAzureCredential, AzureCliCredential, InteractiveBrowserCredential, TokenCredential } from "@azure/identity";
import * as VsoBaseInterfaces from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import * as azdev from "azure-devops-node-api";

/**
 * Azure DevOps scope for token requests.
 */
const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

/**
 * Generic auth handler that wraps any @azure/identity TokenCredential.
 * Supports automatic token refresh and re-authentication on 401.
 */
export class TokenCredentialAuthHandler implements IRequestHandler {
  private token: AccessToken | undefined;
  private authHandler: IRequestHandler | undefined;

  constructor(private readonly credential: TokenCredential) {}

  /**
   * Create handler from DefaultAzureCredential (Entra).
   */
  public static async createEntra(): Promise<TokenCredentialAuthHandler> {
    const handler = new TokenCredentialAuthHandler(new DefaultAzureCredential());
    await handler.ensureToken();
    return handler;
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
    const credential = new InteractiveBrowserCredential({
      ...(options?.tenantId && { tenantId: options.tenantId }),
      ...(options?.clientId && { clientId: options.clientId }),
      redirectUri: "http://localhost",
    });
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
