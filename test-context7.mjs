#!/usr/bin/env node

/**
 * Test Context7 MCP Integration
 * 
 * Run: node test-context7.mjs
 */

import { spawn } from 'child_process';

const CONTEXT7_SERVER = {
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
};

async function testContext7() {
  console.log('🔍 Testing Context7 MCP Server Integration\n');
  
  // Test 1: Resolve Library ID
  console.log('Test 1: Resolving library "react"...');
  try {
    const result = await callMCP('resolve-library-id', { libraryName: 'react' });
    console.log('✅ Success! Found libraries:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
  
  console.log('\n---\n');
  
  // Test 2: Get Library Docs
  console.log('Test 2: Fetching React documentation...');
  try {
    const result = await callMCP('get-library-docs', {
      context7CompatibleLibraryID: '/facebook/react',
      topic: 'hooks',
      tokens: 5000
    });
    console.log('✅ Success! Retrieved documentation:');
    const content = normalizeContent(result.content);
    console.log('Content length:', content.length, 'characters');
    const preview = content.slice(0, 200);
    console.log('Preview:', preview + (content.length > 200 ? '...' : ''));
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

function normalizeContent(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((chunk) => {
        if (!chunk) return '';
        if (typeof chunk === 'string') return chunk;
        if (typeof chunk.text === 'string') return chunk.text;
        return JSON.stringify(chunk);
      })
      .join('\n')
      .trim();
  }
  if (typeof raw === 'object' && typeof raw.text === 'string') {
    return raw.text;
  }
  return String(raw);
}

function callMCP(toolName, params) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CONTEXT7_SERVER.command, CONTEXT7_SERVER.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let hasResponded = false;
    let initReceived = false;
    let timeoutId;

    const handleSuccess = (result) => {
      if (hasResponded) return;
      hasResponded = true;
      clearTimeout(timeoutId);
      proc.kill();
      resolve(result);
    };

    const handleFailure = (error) => {
      if (hasResponded) return;
      hasResponded = true;
      clearTimeout(timeoutId);
      proc.kill();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    timeoutId = setTimeout(() => {
      handleFailure(new Error('Timeout after 30 seconds'));
    }, 30000);

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Look for JSON-RPC responses
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim() && line.includes('"jsonrpc"')) {
          try {
            const response = JSON.parse(line);
            
            // Handle initialization response
            if (response.id === 0 && !initReceived) {
              initReceived = true;
              console.log('   📡 MCP server initialized');
              
              // Now send the actual tool call
              const toolRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                  name: toolName,
                  arguments: params,
                },
              };
              proc.stdin.write(JSON.stringify(toolRequest) + '\n');
            }
            
            // Handle tool response
            if (response.id === 1 && !hasResponded) {
              if (response.error) {
                handleFailure(new Error(response.error.message || JSON.stringify(response.error)));
              } else {
                handleSuccess(response.result);
              }
            }
          } catch (e) {
            // Not valid JSON, continue buffering
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      handleFailure(new Error(`Failed to spawn: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (!hasResponded) {
        handleFailure(new Error(`Server closed (code ${code})\nStderr: ${stderr}`));
      }
    });

    // Send initialization request
    const initRequest = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'context7-test',
          version: '1.0.0'
        }
      },
    };
    
    proc.stdin.write(JSON.stringify(initRequest) + '\n');

    proc.stdout.on('close', () => clearTimeout(timeoutId));
  });
}

testContext7()
  .then(() => {
    console.log('\n🎉 Context7 MCP smoke test finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
