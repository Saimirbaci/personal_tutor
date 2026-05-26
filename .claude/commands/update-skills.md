# Update Skills

Review and update the Claude Code infrastructure for the **Personal Tutor** app. This command can both update existing skills/agents/rules AND create new ones when needed.

## What to Update/Create

$ARGUMENTS

If no specific target is given, perform a full audit and update of all `.claude/` files.

## Process

### Step 1: Audit Current State
Read the current `.claude/` files and the actual codebase to find gaps:

```bash
# Check current .claude/ structure
ls -la .claude/
ls -la .claude/agents/
ls -la .claude/rules/common/ .claude/rules/rust/ .claude/rules/typescript/
ls -la .claude/commands/
```

Then read key codebase files to understand what's changed:
- `src-tauri/src/lib.rs` — new commands registered?
- `src-tauri/src/db/mod.rs` — new tables?
- `src/data/types.ts` — new types?
- `src/store/appStore.ts` — new state/actions?
- `src/hooks/` — new hooks?
- `src-tauri/Cargo.toml` — new dependencies?
- `package.json` — new npm packages?

### Step 2: Identify Gaps
For each `.claude/` file, check if it reflects the current codebase:

**CLAUDE.md gaps to look for:**
- New Tauri commands not listed
- New DB tables not documented
- New GenUI block types not documented
- New AI providers not mentioned
- Stack changes (new dependencies)

**Rules gaps to look for:**
- New patterns established in code but not in rules
- Deprecated patterns still referenced in rules
- New libraries added that need usage rules

**Agent gaps to look for:**
- New domain areas that need specialist agents
- Existing agents referencing outdated file paths or patterns
- Missing agents for: new feature domains, debugging areas

**Command gaps to look for:**
- Common workflows that lack a command
- Commands that reference wrong file paths

### Step 3: Update or Create

**For existing files** — update in place, preserving what's still accurate:
- Add new patterns, commands, file paths
- Remove references to deleted/renamed files
- Update code examples if APIs changed

**For new files** — create with this structure:

New agent file template:
```markdown
---
name: staff-<role>
description: Use this agent when... [specific trigger conditions]
tools: Read, Edit, Write, Bash, Glob, Grep
model: claude-opus-4-5
---

You are a staff-level [role] for the **Personal Tutor** app...

[Repo-specific context: file paths, patterns, constraints]
```

New rule file template:
```markdown
# [Language/Domain] Rules ([Personal Tutor] [Layer])

## [Category]
- Rule with specific code example
- ...
```

New command file template:
```markdown
# [Command Name]

[What this command does for the Personal Tutor app]

## [Section]
[Step-by-step process]
```

### Step 4: Verify Consistency
After updating, verify cross-references are consistent:
- File paths in agents match actual files
- Tauri command names in docs match `lib.rs` registrations
- TypeScript type names match `src/data/types.ts`
- DB table names match `db/mod.rs` schema

### Step 5: Report
Summarize:
- Files updated: what changed and why
- Files created: what new coverage was added
- Gaps still remaining (that need more codebase work before documenting)
- Recommended follow-up: any missing agents, rules, or commands to add next
