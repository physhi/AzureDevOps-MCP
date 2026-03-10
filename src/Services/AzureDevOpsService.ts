import * as azdev from "azure-devops-node-api";
import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import {
  AzureDevOpsConfig,
  RawWorkItemResponse,
} from "../Interfaces/AzureDevOps";
import {
  getPersonalAccessTokenHandler,
  getNtlmHandler,
  getBasicHandler,
} from "azure-devops-node-api/WebApi";
import * as VsoBaseInterfaces from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import {
  IRequestHandler,
} from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";
import { TokenCredentialAuthHandler } from "./EntraAuthHandler";

export class AzureDevOpsService {
  protected connection: azdev.WebApi;
  protected config: AzureDevOpsConfig;
  protected authHandler: IRequestHandler | undefined;
  private _authenticatedUserId?: string;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;

    // Get the appropriate authentication handler

    const tokenCredentialAuthTypes = ["entra", "azcli", "interactive"];
    if (config.auth?.type && tokenCredentialAuthTypes.includes(config.auth.type)) {
      if (config.isOnPremises) {
        throw new Error(
          `${config.auth.type} authentication is not supported for on-premises Azure DevOps.`
        );
      }
      if(!config.tokenCredentialAuthHandler) {
        throw new Error(
          `${config.auth.type} authentication requires a pre-initialized token credential auth handler.`
        );
      }
      this.authHandler = config.tokenCredentialAuthHandler;
    } else if (config.isOnPremises && config.auth) {
      switch (config.auth.type) {
        case 'ntlm':
          if (!config.auth.username || !config.auth.password) {
            throw new Error(
              "NTLM authentication requires username and password"
            );
          }
          this.authHandler = getNtlmHandler(
            config.auth.username,
            config.auth.password,
            config.auth.domain
          );
          break;
        case 'basic':
          if (!config.auth.username || !config.auth.password) {
            throw new Error(
              "Basic authentication requires username and password"
            );
          }
          this.authHandler = getBasicHandler(
            config.auth.username,
            config.auth.password
          );
          break;
        case 'pat':
        default: // Default to PAT for on-premises if auth type is missing or unrecognized
          if (!config.personalAccessToken) {
            throw new Error(
              "PAT authentication requires a personal access token for on-premises if specified or as fallback."
            );
          }
          this.authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
      }
    } else {
      // Cloud environment, and not 'entra'
      if (config.auth?.type === "pat" || !config.auth) {
        // Explicitly PAT or no auth specified (defaults to PAT for cloud)
        if (!config.personalAccessToken) {
          throw new Error(
            "Personal Access Token is required for cloud authentication when auth type is PAT or not specified."
          );
        }
        this.authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);
      } else {
        // This case should ideally not be reached if config is validated correctly
        throw new Error(
          `Unsupported authentication type "${config.auth?.type}" for Azure DevOps cloud.`
        );
      }
    }

    // Create the connection with the appropriate base URL
    let baseUrl = config.orgUrl;
    if (config.isOnPremises && config.collection) {
      // For on-premises, ensure the collection is included in the URL
      baseUrl = `${config.orgUrl}/${config.collection}`;
    }

    // Create options for the WebApi
    const requestOptions: VsoBaseInterfaces.IRequestOptions = {};

    // For on-premises with API version specification, we'll add it to request headers
    if (config.isOnPremises && config.apiVersion) {
      requestOptions.headers = {
        Accept: `application/json;api-version=${config.apiVersion}`,
      };
    }

    // Create the WebApi instance
    // At this point, authHandler is guaranteed to be defined or an error would have been thrown.
    this.connection = new azdev.WebApi(baseUrl, this.authHandler, requestOptions);
  }

  /**
   * Get the WorkItemTracking API client
   */
  protected async getWorkItemTrackingApi(): Promise<WorkItemTrackingApi> {
    return await this.connection.getWorkItemTrackingApi();
  }

  /**
   * Defense-in-depth: retry an operation once after refreshing the auth token.
   * Catches auth errors (401/403) at the service layer even if the HTTP-level
   * retry in TokenCredentialAuthHandler didn't fire (e.g. SDK swallowed it).
   */
  protected async withAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.status;
      const message = (error?.message || '').toLowerCase();
      const isAuthError = statusCode === 401 || statusCode === 403
        || message.includes('unauthorized') || message.includes('authentication failed');

      if (isAuthError && this.authHandler instanceof TokenCredentialAuthHandler) {
        console.error(`[Auth] Service-layer auth retry: refreshing token...`);
        await this.authHandler.forceRefresh();
        return await operation();
      }
      throw error;
    }
  }

  /**
   * List work items based on a WIQL query
   */
  public async listWorkItems(wiqlQuery: string): Promise<RawWorkItemResponse> {
    try {
      const witApi = await this.getWorkItemTrackingApi();

      // Execute the WIQL query
      const queryResult = await witApi.queryByWiql(
        {
          query: wiqlQuery,
        },
        {
          project: this.config.project,
        }
      );

      // Return the work items
      return {
        workItems: queryResult.workItems || [],
        count: queryResult.workItems?.length || 0,
      };
    } catch (error) {
      console.error("Error listing work items:", error);
      throw error;
    }
  }

  /**
   * Get the authenticated user's ID, cached after first resolution.
   */
  protected async getAuthenticatedUserId(): Promise<string> {
    if (!this._authenticatedUserId) {
      const connectionData = await this.connection.connect();
      this._authenticatedUserId = connectionData.authenticatedUser?.id;
    }
    if (!this._authenticatedUserId) {
      throw new Error('Could not determine authenticated user identity. Ensure your credentials are valid.');
    }
    return this._authenticatedUserId;
  }
}
