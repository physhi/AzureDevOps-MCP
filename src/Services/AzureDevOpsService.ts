import * as azdev from "azure-devops-node-api";
import * as os from "os";
import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import {
  AzureDevOpsConfig,
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
import { isRepositoryId } from "../utils/repositoryResolver";
import packageJson from "../../package.json";

export interface ThrottleNotice {
  waitMs: number;
  statusCode?: number;
  reason: string;
  observedAt: string;
}

export interface ThrottleInfo {
  throttled: boolean;
  retryCount: number;
  totalWaitMs: number;
  notices: ThrottleNotice[];
}

interface RetryContext {
  operationName: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export class AzureDevOpsService {
  protected connection: azdev.WebApi;
  protected config: AzureDevOpsConfig;
  protected authHandler: IRequestHandler | undefined;
  private _authenticatedUserId?: string;
  private throttleNotices: ThrottleNotice[] = [];

  protected static readonly BASE_SUMMARY_FIELDS: readonly string[] = [
    'System.Id',
    'System.Title',
    'System.TeamProject',
    'System.WorkItemType',
    'System.State',
    'System.AssignedTo',
    'System.CreatedBy',
    'System.CreatedDate',
    'System.ChangedDate',
    'System.AreaPath',
    'System.IterationPath',
    'Microsoft.VSTS.Common.Priority',
  ];

  protected static readonly SCHEDULING_FIELDS: readonly string[] = [
    'Microsoft.VSTS.Scheduling.OriginalEstimate',
    'Microsoft.VSTS.Scheduling.CompletedWork',
    'Microsoft.VSTS.Scheduling.RemainingWork',
  ];

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
    const hostName = os.hostname().replace(/[^A-Za-z0-9._-]/g, '_');
    let userName = 'unknown-user';
    try {
      userName = os.userInfo().username.replace(/[^A-Za-z0-9._-]/g, '_');
    } catch {
      // Best effort only; keep the client traceable even if user info is unavailable.
    }
    const userAgent = `azuredevops-mcp/${packageJson.version} (${hostName}; ${userName})`;
    requestOptions.headers = {
      'User-Agent': userAgent,
    };

    // For on-premises with API version specification, we'll add it to request headers
    if (config.isOnPremises && config.apiVersion) {
      requestOptions.headers = {
        ...requestOptions.headers,
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
  protected async withAuthRetry<T>(operation: () => Promise<T>, context?: RetryContext, throttleAccumulator?: ThrottleNotice[]): Promise<T> {
    let authRetried = false;
    let throttleRetried = 0;
    const contextLabel = this.formatRetryContext(context);
    const notices = throttleAccumulator ?? this.throttleNotices;

    while (true) {
      try {
        return await operation();
      } catch (error: any) {
        const statusCode = error?.statusCode || error?.status;
        const message = (error?.message || '').toLowerCase();
        const isAuthError = statusCode === 401 || statusCode === 403
          || message.includes('unauthorized') || message.includes('authentication failed');

        if (isAuthError && !authRetried && this.authHandler instanceof TokenCredentialAuthHandler) {
          authRetried = true;
          console.error(`[Auth] Service-layer auth retry: refreshing token${contextLabel ? ` for ${contextLabel}` : ''}...`);
          await this.authHandler.forceRefresh();
          continue;
        }

        const throttleInfo = this.getThrottleInfo(error);
        if (throttleInfo && throttleRetried < 2) {
          throttleRetried += 1;
          notices.push({
            ...throttleInfo,
            observedAt: new Date().toISOString(),
          });
          console.error(`[Throttle] Azure DevOps throttled request${contextLabel ? ` for ${contextLabel}` : ''}. Waiting ${throttleInfo.waitMs}ms before retry ${throttleRetried}.`);
          await this.sleep(throttleInfo.waitMs);
          continue;
        }

        if (throttleInfo) {
          error.throttleInfo = {
            throttled: true,
            retryCount: throttleRetried,
            totalWaitMs: notices.reduce((sum, notice) => sum + notice.waitMs, 0),
            notices: [...notices, { ...throttleInfo, observedAt: new Date().toISOString() }],
            context,
          };
        }

        throw error;
      }
    }
  }

  protected static buildThrottleInfo(notices: ThrottleNotice[]): ThrottleInfo | undefined {
    if (notices.length === 0) {
      return undefined;
    }
    return {
      throttled: true,
      retryCount: notices.length,
      totalWaitMs: notices.reduce((sum, notice) => sum + notice.waitMs, 0),
      notices,
    };
  }

  protected drainThrottleInfo(): ThrottleInfo | undefined {
    if (this.throttleNotices.length === 0) {
      return undefined;
    }

    const notices = [...this.throttleNotices];
    this.throttleNotices = [];

    return AzureDevOpsService.buildThrottleInfo(notices)!;
  }

  private async sleep(waitMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  private getThrottleInfo(error: any): Omit<ThrottleNotice, 'observedAt'> | undefined {
    const statusCode = error?.statusCode || error?.status;
    const message = String(error?.message || '').toLowerCase();
    const isThrottle = statusCode === 429
      || message.includes('rate limit')
      || message.includes('too many requests')
      || message.includes('throttle');

    if (!isThrottle) {
      return undefined;
    }

    const headers = error?.response?.headers || error?.headers || error?.result?.headers || error?.response?.message?.headers;
    const retryAfter = this.getHeaderValue(headers, 'retry-after');
    const rateLimitDelay = this.getHeaderValue(headers, 'x-ratelimit-delay');

    let waitMs = 15_000;
    let reason = 'Azure DevOps is throttling requests.';

    if (retryAfter) {
      const retryAfterSeconds = Number(retryAfter);
      if (!Number.isNaN(retryAfterSeconds)) {
        waitMs = Math.max(1, Math.ceil(retryAfterSeconds)) * 1000;
      } else {
        const retryDate = Date.parse(retryAfter);
        if (!Number.isNaN(retryDate)) {
          waitMs = Math.max(1000, retryDate - Date.now());
        }
      }
      reason = `Azure DevOps requested a retry after ${retryAfter}.`;
    } else if (rateLimitDelay) {
      const delaySeconds = Number(rateLimitDelay);
      if (!Number.isNaN(delaySeconds)) {
        waitMs = Math.max(1, Math.ceil(delaySeconds)) * 1000;
      }
      reason = `Azure DevOps returned X-RateLimit-Delay=${rateLimitDelay}.`;
    }

    return {
      waitMs,
      statusCode,
      reason,
    };
  }

  private getHeaderValue(headers: any, name: string): string | undefined {
    if (!headers) {
      return undefined;
    }

    if (typeof headers.get === 'function') {
      return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
    }

    if (Array.isArray(headers)) {
      const match = headers.find((entry: any) => Array.isArray(entry) && String(entry[0]).toLowerCase() === name.toLowerCase());
      return match ? String(match[1]) : undefined;
    }

    if (typeof headers === 'object') {
      const key = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());
      if (key) {
        const value = headers[key];
        return Array.isArray(value) ? String(value[0]) : String(value);
      }
    }

    return undefined;
  }

  private formatRetryContext(context?: RetryContext): string {
    if (!context?.operationName) {
      return '';
    }

    const details = context.details
      ? Object.entries(context.details)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')
      : '';

    return details ? `${context.operationName} (${details})` : context.operationName;
  }

  protected getRequestedFields(fields?: string[], defaults?: readonly string[]): string[] {
    const selected = fields && fields.length > 0 ? fields : (defaults || AzureDevOpsService.BASE_SUMMARY_FIELDS);
    return Array.from(new Set(selected));
  }

  protected transformSummaryWorkItem(workItem: any): any {
    const fields = workItem.fields || {};
    return {
      id: workItem.id,
      url: workItem.url,
      title: fields['System.Title'],
      teamProject: fields['System.TeamProject'],
      workItemType: fields['System.WorkItemType'],
      state: fields['System.State'],
      assignedTo: fields['System.AssignedTo'] ? {
        displayName: fields['System.AssignedTo'].displayName,
        uniqueName: fields['System.AssignedTo'].uniqueName,
      } : null,
      createdBy: fields['System.CreatedBy'] ? {
        displayName: fields['System.CreatedBy'].displayName,
        uniqueName: fields['System.CreatedBy'].uniqueName,
      } : null,
      createdDate: fields['System.CreatedDate'],
      changedDate: fields['System.ChangedDate'],
      areaPath: fields['System.AreaPath'],
      iterationPath: fields['System.IterationPath'],
      priority: fields['Microsoft.VSTS.Common.Priority'],
      originalEstimate: fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
      completedWork: fields['Microsoft.VSTS.Scheduling.CompletedWork'],
      remainingWork: fields['Microsoft.VSTS.Scheduling.RemainingWork'],
      fields,
    };
  }

  /**
   * Batch-fetch work item details for an array of refs (IDs or relation objects).
   * Handles the ADO 200-ID-per-call limit automatically.
   */
  protected async hydrateWorkItemRefs(
    refs: any[],
    options?: {
      fields?: string[];
      defaults?: readonly string[];
      extractId?: (ref: any) => number | undefined;
      operationName?: string;
      project?: string;
      throttleAccumulator?: ThrottleNotice[];
    },
  ): Promise<any[]> {
    const extractId = options?.extractId ?? ((ref: any) => ref?.id);
    const project = options?.project ?? this.config.project;
    const operationName = options?.operationName ?? 'batchHydrate';

    const ids = (refs || [])
      .map(extractId)
      .filter((id: number | undefined): id is number => typeof id === 'number');

    if (ids.length === 0) {
      return [];
    }

    const witApi = await this.getWorkItemTrackingApi();
    const requestedFields = this.getRequestedFields(options?.fields, options?.defaults);

    const BATCH_SIZE = 200;
    const allWorkItems: any[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchResult = await this.withAuthRetry(
        () => witApi.getWorkItems(batch, requestedFields, undefined, undefined, undefined, project),
        { operationName, details: { project, ids: batch.length, fields: requestedFields.length } },
        options?.throttleAccumulator,
      );
      allWorkItems.push(...(batchResult || []));
    }

    return allWorkItems.map((workItem: any) => this.transformSummaryWorkItem(workItem));
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

  /**
   * Resolve a repository name to its ID (GUID).
   * Returns as-is if already a GUID. Subclasses (e.g. GitService) may
   * override with caching or richer error handling.
   */
  protected async resolveRepositoryId(repository: string, project?: string): Promise<string> {
    if (isRepositoryId(repository)) {
      return repository;
    }
    const gitApi = await this.connection.getGitApi();
    const repo = await gitApi.getRepository(repository, project || this.config.project);
    if (!repo?.id) {
      throw new Error(`Could not resolve repository "${repository}" in project "${project || this.config.project}"`);
    }
    return repo.id;
  }
}
