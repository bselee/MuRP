# Context7 MCP Server Setup

Context7 integration for fetching up-to-date library documentation in your Codespace.

## What is Context7?

Context7 is an MCP (Model Context Protocol) server that provides access to up-to-date documentation for popular libraries and frameworks. It's useful for:
- Getting accurate, version-specific documentation
- Finding code examples and best practices
- Understanding API references without leaving your development environment

## Installation

The Context7 MCP server is configured in `.mcp.json` and runs automatically in VS Code when the MCP extension is installed.

### Prerequisites

1. **VS Code with MCP Support**: Ensure you have a compatible version of VS Code
2. **Node.js**: Context7 runs via `npx`, which requires Node.js

### Configuration

The `.mcp.json` file configures two MCP servers:

```json
{
  "mcpServers": {
    "tgf-compliance": {
      "command": "python",
      "args": ["-m", "mcp_server.src.server_python"],
      "cwd": "./mcp-server",
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_KEY}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"],
      "description": "Context7 MCP server for fetching up-to-date library documentation"
    }
  }
}
```

## Available Tools

Context7 provides two main tools accessible via the MCP protocol:

### 1. `mcp_context7_resolve-library-id`

Resolves a package/product name to a Context7-compatible library ID.

**Parameters:**
- `libraryName` (string): Name of the library to search for (e.g., "react", "next.js", "supabase")

**Returns:**
- Array of matching libraries with:
  - `id`: Context7-compatible library ID (format: `/org/project` or `/org/project/version`)
  - `name`: Library name
  - `description`: Brief description
  - `trustScore`: Reliability score (0-10)
  - `codeSnippetCount`: Number of code examples available

**Example:**
```typescript
// Search for a library
const results = await resolveLibraryId('react');
// Returns: [{ id: '/facebook/react', name: 'react', description: '...', trustScore: 9, codeSnippetCount: 500 }]
```

### 2. `mcp_context7_get-library-docs`

Fetches up-to-date documentation for a specific library.

**Parameters:**
- `context7CompatibleLibraryID` (string): Library ID from `resolve-library-id` (e.g., `/vercel/next.js`)
- `topic` (string, optional): Specific topic to focus on (e.g., "routing", "hooks", "authentication")
- `tokens` (number, optional): Maximum tokens to retrieve (default: 10000)

**Returns:**
- `libraryId`: The library identifier
- `content`: Documentation content in markdown format
- `topic`: Topic filter applied (if any)
- `fetchedAt`: Timestamp of when docs were fetched
- `tokens`: Number of tokens in the response

**Example:**
```typescript
// Get documentation for Next.js routing
const docs = await getLibraryDocs('/vercel/next.js', 'routing', 10000);
// Returns markdown documentation about Next.js routing
```

## Usage in Codespace

### Via GitHub Copilot Chat

When using GitHub Copilot Chat in VS Code, you can reference Context7 tools:

```
@workspace How do I use React hooks? Use #mcp_context7_resolve-library-id and #mcp_context7_get-library-docs
```

### Via TypeScript/JavaScript Code

Use the provided service layer:

```typescript
import { resolveLibraryId, getLibraryDocs } from './services/context7Service';

// Search for a library
const libraries = await resolveLibraryId('supabase');
console.log(libraries);

// Fetch documentation
const docs = await getLibraryDocs('/supabase/supabase', 'authentication');
console.log(docs.content);
```

### Via React Hook

For React components (standalone testing):

```tsx
import { useContext7 } from './hooks/useContext7';

function MyComponent() {
  const { searchLibrary, fetchDocs, documentation } = useContext7();
  
  const handleSearch = async () => {
    await searchLibrary('tailwindcss');
  };
  
  return (
    <div>
      <button onClick={handleSearch}>Search</button>
      {documentation && <pre>{documentation.content}</pre>}
    </div>
  );
}
```

### Standalone UI Component

The `Context7Panel` component provides a full UI for searching and viewing documentation:

```tsx
import { Context7Panel } from './components/Context7Panel';

function TestPage() {
  return <Context7Panel />;
}
```

## File Structure

```
/workspaces/MuRP/
├── .mcp.json                        # MCP server configuration
├── services/context7Service.ts      # Service layer with caching
├── hooks/useContext7.ts             # React hook for Context7
├── components/Context7Panel.tsx     # Standalone UI component
└── CONTEXT7_SETUP.md               # This file
```

## Features

### Persistent Caching

All searches and documentation are automatically cached in localStorage for 7 days:
- **Search Results**: Cached by library name
- **Documentation**: Cached by library ID + topic
- **Search History**: Last 20 searches saved

### Cache Management

```typescript
import { clearCache, getCacheStats } from './services/context7Service';

// Get cache statistics
const stats = getCacheStats();
console.log(stats);
// { searchCount: 5, docCount: 12, historyCount: 8, cacheSize: "45.23 KB" }

// Clear all cache
clearCache();
```

## Testing

To test Context7 integration:

1. **Manual Testing**: Create a test file and import the service:
   ```bash
   # Create test file
   cat > test-context7.ts << 'EOF'
   import { resolveLibraryId, getLibraryDocs } from './services/context7Service';
   
   async function test() {
     const libs = await resolveLibraryId('react');
     console.log('Libraries:', libs);
     
     if (libs.length > 0) {
       const docs = await getLibraryDocs(libs[0].id);
       console.log('Documentation:', docs.content);
     }
   }
   
   test();
   EOF
   
   # Run test
   npx tsx test-context7.ts
   ```

2. **Component Testing**: Render the `Context7Panel` in a test page

3. **Via Copilot**: Use the MCP tools directly through GitHub Copilot Chat

## Troubleshooting

### MCP Server Not Starting

- Check that Node.js is installed: `node --version`
- Ensure `.mcp.json` is in the workspace root
- Restart VS Code to reload MCP configuration

### Context7 Not Responding

- The Context7 server runs via `npx @context7/mcp-server`
- Check network connectivity (Context7 fetches docs from external sources)
- Look for errors in the MCP output panel in VS Code

### Cache Issues

- Clear cache: `localStorage.removeItem('context7_cache')`
- Check browser developer tools → Application → Local Storage

## Integration Notes

⚠️ **This is NOT integrated into the main MRP app** - Context7 is available as a standalone tool for:
- Documentation lookup during development
- Testing MCP integration
- Learning about libraries used in the project
- Quick reference without leaving the Codespace

The service, hook, and component files can be used independently for documentation purposes.

## Related Documentation

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Context7 Documentation](https://context7.com/)
- MuRP Compliance MCP Server: `mcp-server/README_PYTHON.md`
