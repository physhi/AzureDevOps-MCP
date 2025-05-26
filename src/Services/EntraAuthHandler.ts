import { AccessToken, DefaultAzureCredential } from "@azure/identity";
import * as VsoBaseInterfaces from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import * as azdev from "azure-devops-node-api";

export class EntraAuthHandler implements IRequestHandler {
  private static instance: EntraAuthHandler;
  private token: AccessToken | undefined;
  private readonly credential: DefaultAzureCredential;
  private readonly scope: string =
    "499b84ac-1321-427f-aa17-267ca6975798/.default";

  private authHandler: IRequestHandler | undefined;
  private constructor() { // Made constructor private
    this.credential = new DefaultAzureCredential();
  }

  public static async getInstance(): Promise<EntraAuthHandler> {
    if (!EntraAuthHandler.instance) {
      EntraAuthHandler.instance = new EntraAuthHandler();
    }
    await EntraAuthHandler.instance.ensureToken();
    return EntraAuthHandler.instance;
  }

  private isTokenExpired(): boolean {
    const currentTime = new Date().getTime();
    // Check if the token is expired or will expire in the next 60 seconds
    return this.token!.expiresOnTimestamp <= currentTime + 60000;
  }

  private async ensureToken() {
    if (!this.token || this.isTokenExpired()) {
      this.token = await this.credential.getToken(this.scope);
      this.authHandler = azdev.getHandlerFromToken(this.token.token);
    }
  }
  public prepareRequest(options: VsoBaseInterfaces.IRequestOptions): void {
    if (this.authHandler) {
      this.authHandler.prepareRequest(options);
    }
    // If no authHandler, the request will be sent unauthenticated.
    // If it fails with 401, canHandleAuthentication and handleAuthentication will be invoked.
  }

  public canHandleAuthentication(
    response: VsoBaseInterfaces.IHttpClientResponse
  ): boolean {
    if (this.authHandler) {
      return this.authHandler.canHandleAuthentication(response);
    }
    // If authHandler is not set, we can handle it if it's a 401 error
    // typically handled by token-based authentication.
    // This condition is standard in azure-devops-node-api handlers.
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
