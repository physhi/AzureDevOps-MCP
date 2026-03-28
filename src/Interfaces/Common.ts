import { isStructuredContentEnabled } from '../config';
import { execSync } from 'child_process';

/**
 * Interface for MCP-compatible response format
 */
export interface McpResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: {
    format: string;
    data: any;
  };
  [key: string]: any; // Add index signature for backward compatibility
}

/**
 * Formats a response for MCP compatibility
 * @param data The data to format
 * @param message Optional message to display (if it contains markdown formatting with --- or tables, it will be used as the primary content)
 * @param isError Whether this is an error response
 * @param includeStructuredContent Whether to include structuredContent field (MCP standard)
 * @returns MCP-compatible response
 */
export function formatMcpResponse(data: any, message?: string, isError = false, includeStructuredContent = false): McpResponse {
  // When a message is provided, use it as the sole content (markdown-formatted tools)
  // Only fall back to JSON dump when no message is provided at all
  const hasMessage = message && message.length > 0;
  const throttleInfo = data?.throttleInfo;
  const throttleBanner = throttleInfo?.throttled
    ? `Warning: Azure DevOps throttled this operation. Waited ${(throttleInfo.totalWaitMs / 1000).toFixed(1)}s across ${throttleInfo.retryCount} retr${throttleInfo.retryCount === 1 ? 'y' : 'ies'} before continuing. This usually means too many requests are being sent in a short period.\n\n---\n\n`
    : '';

  const response: McpResponse = {
    content: hasMessage
      ? [{ type: "text", text: `${throttleBanner}${message}` }]
      : [
          { type: "text", text: isError ? "Error occurred" : "Request successful" },
          { type: "text", text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }
        ],
    rawData: data,
    isError
  };

  // Add structured content if requested AND env toggle is enabled
  if (includeStructuredContent && isStructuredContentEnabled() && data) {
    response.structuredContent = {
      format: "application/json",
      data: data
    };
  }

  return response;
}

/**
 * Attempts to detect Azure DevOps org/project/repo from git remotes in the current working directory.
 * Returns null if git is unavailable or no ADO remote is found.
 */
function detectGitRemoteInfo(): { orgUrl: string; project: string; repository: string } | null {
  try {
    const output = execSync('git remote -v', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });

    // dev.azure.com format: https://dev.azure.com/{org}/{project}/_git/{repo}
    const devMatch = output.match(/https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^\s]+)/);
    if (devMatch) {
      return { orgUrl: `https://dev.azure.com/${devMatch[1]}`, project: decodeURIComponent(devMatch[2]), repository: decodeURIComponent(devMatch[3]) };
    }

    // visualstudio.com format: https://{org}.visualstudio.com/{project}/_git/{repo}
    const vsMatch = output.match(/https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^\s]+)/);
    if (vsMatch) {
      return { orgUrl: `https://${vsMatch[1]}.visualstudio.com`, project: decodeURIComponent(vsMatch[2]), repository: decodeURIComponent(vsMatch[3]) };
    }

    // SSH format: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
    const sshMatch = output.match(/git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^\s]+)/);
    if (sshMatch) {
      return { orgUrl: `https://dev.azure.com/${sshMatch[1]}`, project: decodeURIComponent(sshMatch[2]), repository: decodeURIComponent(sshMatch[3]) };
    }

    return null;
  } catch {
    return null;
  }
}

// Stored server config context for enriching error messages
let _serverContext: { orgUrl?: string; project?: string; authType?: string } = {};

/**
 * Sets the server config context so error messages can reference configured values.
 * Call once during server startup.
 */
export function setErrorContext(context: { orgUrl?: string; project?: string; authType?: string }): void {
  _serverContext = context;
}

/**
 * Creates an error response
 * @param error The error that occurred
 * @returns MCP-compatible error response
 */
export function formatErrorResponse(error: any): McpResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let md = `Error: ${errorMessage}`;
  const throttleInfo = error?.throttleInfo;

  const lower = errorMessage.toLowerCase();

  if (throttleInfo?.throttled || error?.statusCode === 429 || lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('throttle')) {
    const totalWait = throttleInfo?.totalWaitMs ? `${(throttleInfo.totalWaitMs / 1000).toFixed(1)}s` : 'a retry window';
    md += `\n\n**Azure DevOps is throttling requests.** The server waited for ${totalWait} before giving up. This indicates too many requests are being sent in a short period.`;
  }

  // Auth error hints
  const statusCode = error?.statusCode || error?.status;
  if (statusCode === 401 || statusCode === 403 || lower.includes('unauthorized') || lower.includes('authentication failed')) {
    md += `\n\n**Authentication failed.** Your token may have expired.`;
    if (_serverContext.authType === 'pat') {
      md += ` Generate a new PAT and restart the server.`;
    } else if (_serverContext.authType && ['entra', 'azcli', 'interactive'].includes(_serverContext.authType)) {
      md += ` The server will attempt automatic token refresh. If this persists, restart the server.`;
    }
  }

  // Append git remote discovery hint for repo/project-not-found errors
  if (
    lower.includes('not found in project') ||
    lower.includes('failed to resolve repository') ||
    (lower.includes('repository') && (lower.includes('not found') || lower.includes('does not exist'))) ||
    (lower.includes('project') && (lower.includes('not found') || lower.includes('does not exist'))) ||
    /tf[24]\d{5}/i.test(errorMessage)
  ) {
    const gitInfo = detectGitRemoteInfo();
    if (gitInfo) {
      md += `\n\n**Detected from git remote:** Org: \`${gitInfo.orgUrl}\`, Project: \`${gitInfo.project}\`, Repository: \`${gitInfo.repository}\`\n`;
      md += `**ACTION REQUIRED:** Retry the operation using the correct values above.`;
    } else {
      md += `\n\n**ACTION REQUIRED:** The repository or project name you provided is incorrect. `;
      if (_serverContext.orgUrl || _serverContext.project) {
        md += `This server is configured for`;
        if (_serverContext.orgUrl) md += ` org \`${_serverContext.orgUrl}\``;
        if (_serverContext.project) md += `${_serverContext.orgUrl ? ',' : ''} project \`${_serverContext.project}\``;
        md += `. `;
      }
      md += `Run \`git remote -v\` in the user's repo to discover the correct repository name from the Azure DevOps remote URL.\n\n`;
      md += `The remote URL format is: \`https://dev.azure.com/{org}/{PROJECT}/_git/{REPOSITORY}\` `;
      md += `(or \`https://{org}.visualstudio.com/{PROJECT}/_git/{REPOSITORY}\`).\n\n`;
      md += `Parse the URL and retry the operation with the correct values.`;
    }
  }

  return formatMcpResponse({ error: errorMessage }, md, true);
} 