# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full guidelines are in `AGENTS.md`. This file summarizes the most important points for Claude Code.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build (tsdown → dist/)
pnpm check            # Format check + type check + lint (run before commits)
pnpm format:fix       # Auto-fix formatting (oxfmt)
pnpm lint:fix         # Auto-fix lint issues (oxlint)
pnpm tsgo             # TypeScript type checking only
pnpm test             # Run tests (vitest)
pnpm test:coverage    # Run tests with coverage (70% threshold)
pnpm test:fast        # Unit tests only
pnpm test:e2e         # End-to-end tests
pnpm openclaw ...     # Run CLI in dev (via bun/tsx)
pnpm gateway:watch    # Watch gateway with auto-reload
pnpm ui:dev           # Dev UI server
```

Prefer Bun for TypeScript execution in dev/scripts: `bun <file.ts>` / `bunx <tool>`. Built output and production installs use Node.

## Architecture

OpenClaw is a local-first personal AI assistant platform with a central WebSocket gateway (`ws://127.0.0.1:18789`) that routes between messaging channels and an AI agent runtime.

**Message flow:**
```
Channels (Telegram/Discord/Slack/WhatsApp/Signal/iMessage/etc.)
    → Gateway (WS control plane)
    ↔ Pi agent runtime (RPC mode, tool streaming)
    ↔ Clients (CLI, WebChat UI, macOS/iOS/Android apps)
```

**Key source directories:**
- `src/cli/` — CLI wiring and argument parsing
- `src/commands/` — Command implementations
- `src/gateway/` — WebSocket control plane, session management
- `src/agents/` — Multi-agent routing
- `src/channels/` + `src/routing/` — Channel dispatch and built-in channel logic
- `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/imessage/`, `src/web/` — Per-channel code
- `src/providers/` — Model providers (Anthropic, OpenAI, Bedrock, etc.)
- `src/browser/` — Chrome/Chromium CDP automation
- `src/canvas-host/` — A2UI Canvas host
- `src/plugins/` + `src/plugin-sdk/` — Plugin system
- `src/media/` — Image/audio/video pipeline
- `src/infra/` — Logging, errors, ports, env
- `src/terminal/` — Terminal output (tables via `src/terminal/table.ts`, colors via `src/terminal/palette.ts`)
- `extensions/` — Channel extension plugins (msteams, matrix, zalo, voice-call, etc.)
- `skills/` — Bundled skills (xurl, github, discord, etc.)
- `apps/macos/`, `apps/ios/`, `apps/android/` — Native companion apps
- `ui/` — Web Control Panel and WebChat (Vite)

**Plugin system:** Extensions and skills both use `openclaw.plugin.json` manifests. Plugin-only deps stay in the extension's `package.json`. Use `peerDependencies` for `openclaw` in plugins (not `workspace:*` in `dependencies`).

## Coding Conventions

- TypeScript ESM; strict typing; avoid `any`. Never add `@ts-nocheck`.
- Linting: oxlint + oxfmt. Config: `.oxlintrc.json`, `.oxfmtrc.jsonc`.
- No prototype mutation (`applyPrototypeMixins`, etc.) — use explicit inheritance/composition.
- CLI progress: use `src/cli/progress.ts`; don't hand-roll spinners.
- Terminal colors: use `src/terminal/palette.ts` (no hardcoded ANSI colors).
- Keep files under ~500–700 LOC; split/refactor for clarity.
- When adding channels/extensions, update `.github/labeler.yml` and all UI surfaces (macOS, web, mobile, docs).
- Commit via `scripts/committer "<msg>" <file...>` (not `git add`/`git commit` directly).
- Commits: concise, action-oriented (e.g., `CLI: add verbose flag to send`).

## Docs

- Docs: `docs/` hosted on Mintlify at `docs.openclaw.ai`.
- Internal doc links: root-relative, no `.md`/`.mdx` extension (e.g., `[Config](/configuration)`).
- `docs/zh-CN/` is generated — do not edit directly.
- README.md: keep absolute `https://docs.openclaw.ai/...` URLs (GitHub rendering).

## Key Rules

- **Never edit `node_modules`**.
- **Never update the Carbon dependency**.
- Patched dependencies (`pnpm.patchedDependencies`) must use exact versions.
- Patching deps requires explicit user approval.
- Never commit real phone numbers, API keys, or live config values.
- Release: read `docs/reference/RELEASING.md` before any release work. Never bump versions or publish to npm without explicit user consent.
- Multi-agent safety: don't stash, switch branches, or modify worktrees unless explicitly asked. Scope commits to your changes only.
- Tool schemas: avoid `Type.Union`/`anyOf`/`oneOf`; use `stringEnum`/`optionalStringEnum`; avoid raw `format` property names.

## Version Locations (when bumping)

`package.json` · `apps/android/app/build.gradle.kts` · `apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist` · `apps/macos/Sources/OpenClaw/Resources/Info.plist` · `docs/install/updating.md`
