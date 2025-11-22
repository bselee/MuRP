/**
 * MCP Client Helper
 * 
 * Communicates with MCP servers via stdio protocol
 */

import { spawn } from 'child_process';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Call an MCP tool via stdio communication
 */
export async function callMCPTool(
  serverConfig: MCPServerConfig,
  toolName: string,
  params: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(serverConfig.command, serverConfig.args, {
      env: { ...process.env, ...serverConfig.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let hasResponded = false;

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Try to parse JSON-RPC responses
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim() && line.includes('"jsonrpc"')) {
          try {
            const response: MCPResponse = JSON.parse(line);
            if (response.id === 1 && !hasResponded) {
              hasResponded = true;
              proc.kill();
              
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result);
              }
            }
          } catch (e) {
            // Not valid JSON yet, continue buffering
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      if (!hasResponded) {
        hasResponded = true;
        reject(new Error(`Failed to spawn MCP server: ${error.message}`));
      }
    });

    proc.on('close', (code) => {
      if (!hasResponded) {
        if (code !== 0) {
          reject(new Error(`MCP server exited with code ${code}\nStderr: ${stderr}`));
        } else {
          reject(new Error('MCP server closed without response'));
        }
      }
    });

    // Send the JSON-RPC request
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: `tools/call`,
      params: {
        name: toolName,
        arguments: params,
      },
    };

    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        proc.kill();
        reject(new Error('MCP request timeout after 30 seconds'));
      }
    }, 30000);
  });
}

/**
 * Context7 MCP server configuration
 */
export const CONTEXT7_SERVER: MCPServerConfig = {
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
  env: {
    CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || '',
  },
};

/**
 * Call Context7 resolve-library-id tool
 */
export async function callContext7ResolveLibrary(libraryName: string): Promise<any> {
  return callMCPTool(CONTEXT7_SERVER, 'resolve-library-id', { libraryName });
}

/**
 * Call Context7 get-library-docs tool
 */
export async function callContext7GetDocs(
  libraryId: string,
  topic?: string,
  tokens?: number
): Promise<any> {
  return callMCPTool(CONTEXT7_SERVER, 'get-library-docs', {
    context7CompatibleLibraryID: libraryId,
    topic,
    tokens,
  });
}
