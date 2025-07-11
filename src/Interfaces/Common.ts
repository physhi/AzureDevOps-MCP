/**
 * Interface for MCP-compatible response format
 */
export interface McpResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  [key: string]: any; // Add index signature
}

/**
 * Formats a response for MCP compatibility
 * @param data The data to format
 * @param message Optional message to display (if it contains markdown formatting with --- or tables, it will be used as the primary content)
 * @param isError Whether this is an error response
 * @returns MCP-compatible response
 */
export function formatMcpResponse(data: any, message?: string, isError = false): McpResponse {
  // If message contains markdown formatting (starts with --- or contains table markdown), use it as primary content
  if (message) {
    return {
      content: [
        {
          type: "text",
          text: message
        }
      ],
      rawData: data,
      isError
    };
  }
  
  return {
    content: [
      {
        type: "text",
        text: message || (isError ? "Error occurred" : "Request successful")
      },
      {
        type: "text",
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ],
    rawData: data,
    isError
  };
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