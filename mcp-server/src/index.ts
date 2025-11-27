#!/usr/bin/env node

/**
 * MuRP Compliance MCP Server
 * 
 * Provides tools for:
 * - Searching state regulations
 * - Extracting requirements from government websites
 * - Updating regulation database
 * - Performing compliance checks
 * - Monitoring for regulation changes
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { searchWebForRegulations } from './tools/web-search.js';
import { extractRegulationFromPdf } from './tools/pdf-extractor.js';
import { updateRegulationDatabase } from './tools/database-updater.js';
import { performComplianceCheck } from './tools/compliance-checker.js';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Define MCP server
const server = new Server(
  {
    name: 'tgf-compliance-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const tools: Tool[] = [
  {
    name: 'search_state_regulations',
    description: 'Search for state regulations on official government websites. Returns URLs and snippets of relevant regulations.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Two-letter state code (e.g., CA, OR, WA)',
        },
        category: {
          type: 'string',
          description: 'Category of regulations to search for',
          enum: ['labeling', 'ingredients', 'claims', 'registration', 'packaging', 'testing', 'all'],
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific keywords to search for (e.g., ["fertilizer", "organic", "label requirements"])',
        },
      },
      required: ['state', 'category'],
    },
  },
  {
    name: 'extract_regulation_from_url',
    description: 'Extract and parse regulation text from a specific government URL. Handles HTML pages and PDFs.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the regulation document',
        },
        state: {
          type: 'string',
          description: 'State code for context',
        },
        category: {
          type: 'string',
          description: 'Regulation category',
        },
      },
      required: ['url', 'state'],
    },
  },
  {
    name: 'update_regulation_database',
    description: 'Update the regulation database with new or changed requirements. Requires review before committing.',
    inputSchema: {
      type: 'object',
      properties: {
        regulations: {
          type: 'array',
          description: 'Array of regulation objects to add/update',
          items: {
            type: 'object',
            properties: {
              state: { type: 'string' },
              category: { type: 'string' },
              rule_title: { type: 'string' },
              rule_text: { type: 'string' },
              rule_summary: { type: 'string' },
              regulation_code: { type: 'string' },
              source_url: { type: 'string' },
              agency_name: { type: 'string' },
              confidence_score: { type: 'number' },
            },
            required: ['state', 'category', 'rule_title', 'rule_text', 'source_url'],
          },
        },
        extraction_method: {
          type: 'string',
          description: 'How these regulations were extracted',
        },
        created_by: {
          type: 'string',
          description: 'User or system that initiated the update',
        },
      },
      required: ['regulations'],
    },
  },
  {
    name: 'check_label_compliance',
    description: 'Check a product label against state regulations. Returns violations, warnings, and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        label_data: {
          type: 'object',
          description: 'Extracted label information',
          properties: {
            product_name: { type: 'string' },
            ingredients: {
              type: 'array',
              items: { type: 'string' },
            },
            claims: {
              type: 'array',
              items: { type: 'string' },
            },
            warnings: {
              type: 'array',
              items: { type: 'string' },
            },
            net_weight: { type: 'string' },
          },
          required: ['product_name'],
        },
        states: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of state codes to check against',
        },
        label_id: {
          type: 'string',
          description: 'UUID of the label being checked',
        },
      },
      required: ['label_data', 'states'],
    },
  },
  {
    name: 'get_regulation_changes',
    description: 'Get recent changes to regulations for monitoring and alerting',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Filter by state code',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back',
          default: 30,
        },
        unacknowledged_only: {
          type: 'boolean',
          description: 'Only show changes that have not been acknowledged',
          default: true,
        },
      },
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_state_regulations': {
        const result = await searchWebForRegulations(
          args.state as string,
          args.category as string,
          args.keywords as string[] || []
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'extract_regulation_from_url': {
        const result = await extractRegulationFromPdf(
          args.url as string,
          args.state as string,
          args.category as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'update_regulation_database': {
        const result = await updateRegulationDatabase(
          supabase,
          args.regulations as any[],
          args.extraction_method as string,
          args.created_by as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'check_label_compliance': {
        const result = await performComplianceCheck(
          supabase,
          args.label_data as any,
          args.states as string[],
          args.label_id as string | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_regulation_changes': {
        const query = supabase
          .from('regulation_changes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (args.state) {
          // Join with state_regulations table to filter by state
          query.eq('regulation_id.state', args.state);
        }

        if (args.unacknowledged_only) {
          query.is('acknowledged_at', null);
        }

        if (args.days) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - (args.days as number));
          query.gte('created_at', cutoffDate.toISOString());
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Database error: ${error.message}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ changes: data, count: data?.length || 0 }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MuRP Compliance MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
