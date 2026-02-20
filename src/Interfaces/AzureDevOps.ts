import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces";

/**
 * Defines the possible authentication types for Azure DevOps.
 */
export type AzureDevOpsAuthType = 'pat' | 'ntlm' | 'basic' | 'entra' | 'azcli' | 'interactive';

/**
 * Configuration for Personal Access Token (PAT) authentication.
 */
export interface PatAuth {
  type: 'pat';
}

/**
 * Configuration for NTLM authentication.
 */
export interface NtlmAuth {
  type: 'ntlm';
  username: string;
  password: string;
  domain?: string;
}

/**
 * Configuration for Basic authentication.
 */
export interface BasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

/**
 * Configuration for Azure Identity (Entra/DefaultAzureCredential) authentication.
 */
export interface AzureIdentityAuth {
  type: 'entra';
}

/**
 * Configuration for Azure CLI credential authentication.
 * Uses the Azure CLI logged-in session for authentication.
 */
export interface AzureCliAuth {
  type: 'azcli';
  tenantId?: string;
}

/**
 * Configuration for Interactive Browser (MSAL) authentication.
 * Opens a browser window for user login with token caching and silent re-auth.
 */
export interface InteractiveAuth {
  type: 'interactive';
  tenantId?: string;
  clientId?: string;
}

/**
 * Union type for all possible Azure DevOps authentication configurations.
 */
export type AzureDevOpsAuthConfig = PatAuth | NtlmAuth | BasicAuth | AzureIdentityAuth | AzureCliAuth | InteractiveAuth;

/**
 * Interface for Azure DevOps configuration
 */
export interface AzureDevOpsConfig {
  orgUrl: string;
  project: string;
  personalAccessToken: string;
  isOnPremises?: boolean;
  collection?: string; // Collection name for on-premises
  apiVersion?: string; // API version for on-premises
  auth?: AzureDevOpsAuthConfig;
  tokenCredentialAuthHandler?: IRequestHandler; // Shared handler for entra/azcli/interactive auth
}

/**
 * Interface for work item query parameters
 */
export interface WorkItemQueryParams {
  query: string;
}

/**
 * Interface for the raw work item response from Azure DevOps
 */
export interface RawWorkItemResponse {
  workItems: any[]; // Using any for flexibility, can be typed more specifically
  count: number;
}

/**
 * Interface for formatted work item response suitable for MCP
 */
export interface WorkItemResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  workItems?: any[]; // Optional raw data if needed
  isError?: boolean;
}
