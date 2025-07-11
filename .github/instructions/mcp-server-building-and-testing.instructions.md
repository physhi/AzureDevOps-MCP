---
applyTo: '**'
---

# MCP Server Building and Testing Instructions

In order to create a good ADO MCP server, you need to follow these steps:

1. **Pick an API / Tool**: Choose an API or tool that you want to implement / improve in the MCP server.
2. **Implement the Tool**: Implement the tool in the `src/Tools` directory. Make sure to follow the existing structure and naming conventions. (or it may already exist).
3. **Return raw data**: Ensure that the tool returns raw data from the API without any additional formatting or processing. We use this to understand what's in the data.
4. **Build the MCP Server**: Use the provided build scripts to compile the server.
5. **Instruct User to reload the MCP server**: After building, instruct the user to reload the MCP server to apply the changes.
6. **Given user instruction invoke tool**: When a user provides an instruction, invoke the tool with the appropriate parameters. The tool should return the raw data as it is.
7. **Reason about the data**: Analyze the raw data returned by the tool to understand its structure and content.
8. **Format the response**: Based on the analysis, format the response to be user-friendly and informative. Use the `formatMcpResponse` function to structure the response.
9. **Build and instruct user to reload**: After formatting the response, build the MCP server again and instruct the user to reload it to see the changes.
10. **Test the Tool**: Ensure that the tool works as expected by testing it with various inputs and scenarios.