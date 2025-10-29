# GitHub Copilot Instructions - How It Works

## Will Copilot Chat Follow These Rules?

**Yes!** GitHub Copilot Chat **automatically** reads and follows the guidelines in `.github/copilot-instructions.md` when you use it in supported IDEs like Visual Studio Code.

## How It Works

### Automatic Integration
- When you interact with GitHub Copilot Chat in your IDE, it automatically reads the `.github/copilot-instructions.md` file from your repository root
- The instructions guide Copilot's responses for code generation, refactoring, bug fixes, and explanations
- These rules apply during **chat interactions**, not during normal inline code completion as you type

### Requirements
To ensure Copilot Chat uses the instruction file:

1. **Use a Supported IDE**: Visual Studio Code (primary), Visual Studio, or JetBrains IDEs with Copilot extension
2. **Enable the Setting**: In VS Code, ensure this setting is enabled:
   ```
   github.copilot.chat.codeGeneration.useInstructionFiles: true
   ```
   (This is typically enabled by default)
3. **File Location**: The instruction file must be at `.github/copilot-instructions.md` (which we've created)

### What Copilot Will Follow

From our `.github/copilot-instructions.md`, Copilot Chat will:

✅ **Follow TODO format standards** when creating or discussing TODOs
- Use the exact format: `// TODO: [PRIORITY] [DATE] [NAME] - Description`
- Include Context, Impact, and Estimated time
- Use appropriate priority levels (CRITICAL, HIGH, MEDIUM, LOW)

✅ **Respect deployment safety protocols**
- Reference the pre-deployment checklist
- Suggest proper git workflow instead of direct master pushes
- Remind about code review requirements

✅ **Apply commit message standards**
- Suggest properly formatted commit messages (type: subject)
- Use conventional commit types (feat, fix, docs, etc.)

✅ **Follow session management practices**
- Suggest creating `.codespace-session.md` files
- Remind about documentation updates

✅ **Apply documentation housekeeping rules**
- Reference TODO-TRACKER.md requirements
- Suggest proper documentation updates

## Example Interactions

### When You Ask Copilot to Add a TODO:
**Before (without instructions):**
```javascript
// TODO: fix this later
```

**After (with instructions):**
```javascript
// TODO: [HIGH] 2025-10-29 YourName - Fix calculation bug in invoice totals
// Context: Rounding error causing $0.01 discrepancies in 15% of invoices
// Impact: Accounting reconciliation failures, customer complaints
// Estimated: 2 hours
```

### When You Ask About Deployment:
Copilot will reference the safety protocol checklist and remind you to:
- Run tests first
- Check for critical TODOs
- Create a PR instead of pushing to master
- Get code review approval

### When You Ask for a Commit Message:
Copilot will suggest:
```
feat: add bulk import for purchase orders

- Parse CSV files with vendor, amount, date
- Validate required fields
- Handle errors gracefully

Closes #123
```

## Limitations

⚠️ **Note**: While Copilot Chat follows these instructions, it:
- Cannot **enforce** them automatically (you still need to review and apply suggestions)
- May not follow instructions perfectly 100% of the time (AI can vary)
- Works best when you explicitly reference the instructions (e.g., "Follow our TODO format")

## Testing It Out

To verify Copilot is reading the instructions:

1. Open GitHub Copilot Chat in VS Code
2. Ask: "What are our TODO formatting rules?"
3. Copilot should reference the exact format from `.github/copilot-instructions.md`

Or ask:
- "What's our deployment process?"
- "How should I format my commit message?"
- "What priority levels do we use for TODOs?"

Copilot should give answers based on our instructions file.

## Best Practices

### 1. Reference Instructions Explicitly
When chatting with Copilot, you can say:
- "Follow our project's TODO format"
- "Create a TODO according to our guidelines"
- "What does our deployment checklist require?"

### 2. Keep Instructions Updated
The `.github/copilot-instructions.md` file should be:
- Updated when team practices change
- Reviewed regularly for relevance
- Clear and specific (not vague)

### 3. Share with Team
Make sure your team knows:
- The instruction file exists
- How to verify Copilot is using it
- Where to find documentation

## Additional Resources

- [VS Code Custom Instructions Documentation](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- Our main instruction file: [.github/copilot-instructions.md](../.github/copilot-instructions.md)

## Questions?

If Copilot doesn't seem to be following the instructions:
1. Check that the file is at `.github/copilot-instructions.md` (correct location)
2. Verify the VS Code setting is enabled
3. Try reloading VS Code window
4. Explicitly mention the instructions in your chat prompt
