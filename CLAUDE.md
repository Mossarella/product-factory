# Project Instructions — Product Factory

## Branches
- `claude/v2-nextjs` — the active trunk for all v2 work. Every PR targets this branch.
- `claude/prototype-app-build-EA58m` — legacy v1 prototype. **NEVER commit, push, merge, or open a PR against this branch.** It belongs to the user's own separate use and is permanently off-limits.

## Push workflow (mandatory)
Never push directly to `claude/v2-nextjs`. Every push follows this process:
1. Before pushing, create a new branch off the current `claude/v2-nextjs` (e.g. `claude/<short-description>`).
2. Push the commit(s) to that new branch.
3. Open a PR from that branch into `claude/v2-nextjs`.

This keeps every change as its own trackable commit/PR pair instead of a flat push history.
