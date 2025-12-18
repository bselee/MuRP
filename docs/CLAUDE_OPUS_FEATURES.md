# Claude Opus 4.5 (Preview) Features in MuRP

This document outlines the AI capabilities available through GitHub Copilot powered by Claude Opus 4.5 (Preview).

## 🧠 Core Coding Capabilities

### Code Generation & Analysis
- **Multi-language support** - TypeScript, JavaScript, Python, SQL, CSS, HTML, and more
- **Context-aware completions** - Understands project structure, imports, and patterns
- **Code generation** - Functions, classes, APIs, React components, database migrations
- **Code review** - Quality analysis, security checks, best practice suggestions
- **Debugging** - Error identification, stack trace analysis, fix recommendations
- **Refactoring** - Safe restructuring while preserving behavior

### Architecture Understanding
- **Schema analysis** - 4-layer data flow (Raw → Parsed → Database → Display)
- **Dependency tracking** - Import analysis, unused code detection
- **Pattern recognition** - Identifies and suggests consistent patterns

## 🔧 Workspace Tools

### File Operations
| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line ranges |
| `create_file` | Create new files with content |
| `replace_string_in_file` | Edit existing files precisely |
| `multi_replace_string_in_file` | Batch edits across multiple files |
| `list_dir` | Browse directory structure |
| `file_search` | Find files by glob pattern |
| `grep_search` | Text/regex search across workspace |
| `semantic_search` | AI-powered code search |

### Terminal & Build
| Tool | Description |
|------|-------------|
| `run_in_terminal` | Execute shell commands |
| `run_task` | Run VS Code tasks |
| `runTests` | Execute unit tests with coverage |
| `get_errors` | Retrieve compile/lint errors |

### Git Integration
| Tool | Description |
|------|-------------|
| `get_changed_files` | View staged/unstaged changes |
| Terminal git commands | stage, commit, push, diff, log |

## 🌐 External Integrations (MCP Servers)

### GitHub MCP
- **Repository management** - Create repos, branches, PRs
- **Issue tracking** - Create, update, search issues
- **Pull requests** - Create, review, merge PRs
- **Copilot coding agent** - Assign tasks to autonomous GitHub Copilot
- **File operations** - Push files, update content remotely

### Brave Search
- **Web search** - General queries, news, articles
- **Local search** - Find businesses, places, services

### Context7
- **Library documentation** - Fetch up-to-date docs for any library
- **Code examples** - Get current API usage patterns

### Playwright Browser
- **Browser automation** - Click, navigate, fill forms
- **Screenshots** - Capture page snapshots
- **Accessibility** - Get accessibility tree snapshots
- **Testing** - Automated E2E testing

### Memory (Knowledge Graph)
- **Entity management** - Create, update, delete entities
- **Relationships** - Track connections between concepts
- **Observations** - Add notes and learnings
- **Search** - Query stored knowledge

### Pylance (Python)
- **Syntax validation** - Check Python code for errors
- **Environment management** - Switch Python environments
- **Import analysis** - Analyze dependencies
- **Documentation** - Pylance configuration help

## 🤖 Autonomous Workflows

### TFR Protocol (Test-Fix-Refactor)
Mandatory before commits:
1. **TEST** - Run full test suite (`npm test`, `npm run e2e`)
2. **FIX** - Analyze failures, fix root causes
3. **REFACTOR** - Clean up code, remove debug statements
4. **RE-TEST** - Verify fixes didn't break anything

### Session Management
- **Auto-resume** - Load context from previous sessions
- **Progress tracking** - Todo list management
- **Documentation** - Automatic session summaries

### Sub-agents
- Launch autonomous agents for complex tasks
- Research, code search, multi-step implementations
- Results returned for review

### Deployment Loops
- **Vercel** - Deploy, detect errors, fix, redeploy automatically
- **Supabase** - Migration validation, edge function deployment

## 📊 Project-Specific Features

### MuRP Integration
- **AI Gateway** - Tier-based AI routing (Basic/Full/Premium)
- **Supabase** - Migration management, type generation
- **Finale API** - Inventory sync, PO management
- **Schema transformers** - Data validation and transformation

### Compliance & Security
- **No direct API calls** - Always use service layers
- **Secure proxy** - API keys never exposed to frontend
- **Audit logging** - Track all external API calls

## 🎯 Best Practices

### When Working with Claude
1. **Be specific** - Clear requirements get better results
2. **Provide context** - Share relevant files and errors
3. **Iterate** - Review suggestions and refine
4. **Use tools** - Let Claude search, read, and edit directly

### Code Quality
- Follow existing patterns in the codebase
- Use TypeScript strict mode (no `any`)
- Validate with Zod schemas
- Handle errors with `{ success, error }` pattern

---

*Last updated: December 13, 2025*
