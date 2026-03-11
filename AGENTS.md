# AGENTS.md

## Commands
- `bun run lint` - Run ESLint
- `bun run typecheck` - Run the app TypeScript compiler checks
- `bun run check` - Run ESLint plus TypeScript compiler checks

## Code Style
- **Formatting**: No semicolons, single quotes, 2-space indent
- **Imports**: Use `@/*` path alias. Order: external deps → internal modules → relative
- **Types**: TypeScript strict mode. Explicit return types on exported functions. Never use `any` or `unknown`.
- **Components**: Function components only. Add `'use client'` directive when using hooks/interactivity
- **Error handling**: Use try/catch with console.error for recoverable errors. Throw Error for auth failures
- **Styling**: Tailwind CSS with `cn()` utility from `@/lib/utils` for conditional classes

# Note
- Do not run the build command unless explicitly instructed to do so.
- Do not start the development server unless explicitly instructed to do so.
- Do not commit code unless explicitly instructed to do so.
- Always run `bun run check` before finishing changes so ESLint and TypeScript compiler checks catch all errors.