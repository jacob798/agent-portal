<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Codex project instructions

Preserve the Next.js guidance above. CLAUDE.md imports this AGENTS.md; read it once
and do not recursively follow that import. Read README.md and the affected UI/API
contracts before changing code. Use existing package scripts and dependency pins.
Keep credentials server-side and preserve the portal's actual runtime boundaries.
Follow the owner's established contract, review, proof and release process for
app changes. Do not equate a passing UI build with a proven backend integration.
Changes require an identified review branch; never merge or deploy without the
owner's authorization. This instruction setup does not authorize runtime changes.
