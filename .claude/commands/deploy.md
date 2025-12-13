Build the project, commit all changes, and deploy to main via the claude/merge-to-main branch.

Steps:
1. Run `npm run build` to ensure the code builds successfully
2. Check git status for any uncommitted changes
3. If there are changes, commit them with a descriptive message based on the changes made
4. Push to the current claude/ branch
5. Checkout claude/merge-to-main-01V2MZUQUduMLjGusbs4Qs8J and merge the changes
6. Push to trigger automatic PR creation and deployment
7. Confirm the PR URL and deployment status

This command automates the entire deployment workflow to avoid manual branch switching and PR creation.
