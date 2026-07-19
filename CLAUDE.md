# Project Instructions — Product Factory

## Branches
- `claude/v2-nextjs` — the active trunk for all v2 work. Every PR targets this branch.
- `claude/prototype-app-build-EA58m` — legacy v1 prototype. **NEVER commit, push, merge, or open a PR against this branch.** It belongs to the user's own separate use and is permanently off-limits.

## Push workflow (mandatory)
Never push directly to `claude/v2-nextjs`. Every push follows this process:
1. Before pushing, create a new branch off the current `claude/v2-nextjs` (e.g. `claude/<short-description>`).
2. Push the commit(s) to that new branch.
3. Open a PR from that branch into `claude/v2-nextjs`.
4. Merge the PR once it's clean/mergeable.

This keeps every change as its own trackable commit/PR pair instead of a flat push history.

**Run this whole sequence (branch → push → PR → merge) without asking for
confirmation at each step** — the user has pre-authorized it as standing
workflow. Only pause if a step fails, the PR isn't cleanly mergeable, or the
change touches something outside this documented flow. (Note: merge may
still be blocked by the user's own Claude Code permission settings — if so,
say so and let them merge manually or adjust their settings, don't try to
route around it.)
