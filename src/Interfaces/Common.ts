import { isStructuredContentEnabled } from '../config';

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

  const response: McpResponse = {
    content: hasMessage
      ? [{ type: "text", text: message }]
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
 * Creates an error response
 * @param error The error that occurred
 * @returns MCP-compatible error response
 */
export function formatErrorResponse(error: any): McpResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return formatMcpResponse({ error: errorMessage }, `Error: ${errorMessage}`, true);
} 