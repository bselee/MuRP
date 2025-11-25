#!/usr/bin/env tsx
/**
 * Gemini CLI - Interactive chat with your MRP system
 * Usage: tsx gemini-cli.ts
 * 
 * Commands:
 * - Ask questions about inventory, BOMs, vendors
 * - Type 'exit' or 'quit' to close
 * - Type 'clear' to clear conversation history
 */

import * as readline from 'readline';
import { askAboutInventory } from './services/geminiService';
import type { InventoryItem, BillOfMaterials, Vendor } from './types';

// Mock data for CLI mode (in production, fetch from Supabase)
const mockInventory: InventoryItem[] = [];
const mockBOMs: BillOfMaterials[] = [];
const mockVendors: Vendor[] = [];

const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function printWelcome() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         🤖 MuRP Gemini CLI - AI Assistant                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Ask me anything about your inventory, BOMs, or vendors!');
  console.log('Commands: exit, quit, clear\n');
}

function prompt() {
  rl.question('You: ', async (input) => {
    const query = input.trim();

    if (!query) {
      prompt();
      return;
    }

    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
      return;
    }

    if (query.toLowerCase() === 'clear') {
      conversationHistory.length = 0;
      console.log('\n✨ Conversation history cleared.\n');
      prompt();
      return;
    }

    // Add user message to history
    conversationHistory.push({ role: 'user', content: query });

    try {
      console.log('\n🤔 Thinking...\n');
      
      const response = await askAboutInventory(
        query,
        mockInventory,
        mockBOMs,
        mockVendors,
        conversationHistory
      );

      // Add assistant response to history
      conversationHistory.push({ role: 'assistant', content: response });

      console.log(`AI: ${response}\n`);
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : String(error), '\n');
    }

    prompt();
  });
}

// Handle Ctrl+C gracefully
rl.on('close', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

// Start the CLI
printWelcome();
prompt();
