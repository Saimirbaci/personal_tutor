# Coding Style Rules

## General
- Write clear, self-documenting code. Prefer descriptive names over comments.
- Keep functions under 50 lines. Extract helper functions when longer.
- One responsibility per function/struct/component.
- No magic numbers — define constants with descriptive names.
- Prefer composition over inheritance.

## Naming Conventions
- Rust: `snake_case` for functions/variables, `PascalCase` for types/structs, `SCREAMING_SNAKE_CASE` for constants
- TypeScript/React: `camelCase` for variables/functions, `PascalCase` for components and types
- Tauri commands: `snake_case` in Rust matching `invoke('snake_case')` in TypeScript
- Zustand actions: `camelCase` verbs — `setView`, `addMessage`, `finalizeStream`

## Documentation
- Rust: `///` doc comments on all public Tauri commands and important structs
- TypeScript: JSDoc on exported hooks, utility functions, and complex types
- Explain "why", not "what" — the code shows what, comments explain reasoning

## Error Messages
- User-facing: generic and helpful ("Failed to send message. Check your API key in Settings.")
- Internal logs: specific with context (`pillar_id`, `conversation_id`, `provider`, error type)
- Never expose raw API errors, stack traces, or internal paths to the UI

## Tauri-Specific Style
- Group all `#[tauri::command]` handlers by domain in separate files under `commands/`
- Tauri commands always return `Result<T, String>` — map errors with `.map_err(|e| e.to_string())`
- Lock `Mutex<Connection>` for the shortest duration possible — do not hold across `await` points
- Use structured `tracing::` macros for logging, not `println!`/`eprintln!`

## React Component Style
- Functional components only — no class components
- Keep components under 200 lines — extract sub-components
- Props interfaces defined above the component, named `<ComponentName>Props`
- Event handlers named `handle<Event>` (e.g., `handleSend`, `handlePillarSelect`)
