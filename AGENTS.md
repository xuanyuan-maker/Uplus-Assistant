# Repository Guidelines

## Project Structure & Module Organization

- `src/main.js` initializes the assistant and coordinates manual and automatic answering.
- `src/questions.js` detects questions, options, images, and navigation; `src/answers.js` applies answers through DOM clicks and native textarea events.
- `src/api.js` handles DeepSeek requests, prompts, and response parsing.
- `src/ui.js` owns the panel, persisted settings, and answered state; `src/logger.js` writes console and panel logs.
- `src/userscript.meta.js` defines metadata and permissions. `scripts/` contains build/browser-check commands; `tests/` contains unit tests and a browser fixture.
- Root `U-plus-Assistant.user.js` is the committed installation bundle. Edit `src/` and rebuild; never edit the bundle manually. There is no backend.

## Build, Test, and Development Commands

Use Node.js 22+ and npm:

- `npm ci` installs locked development dependencies.
- `npm run build` bundles ES modules into one installable userscript with esbuild.
- `npm run dev` rebuilds when source files change.
- `npm test` builds and runs Node.js tests for requests, response parsing, prompts, and the bundle.
- `npm run test:browser` runs Chromium against a local fixture with mocked userscript APIs. Set `CHROME_BIN` if Chromium has a different executable path.

Install the generated bundle in ScriptCat and verify the U+ answer page after changes.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, single-quoted strings, camelCase functions/variables, and UPPER_SNAKE_CASE constants. Match surrounding code; no formatter or linter is configured. Keep DOM timing and event handling intact when moving code. Preserve existing storage keys and userscript identity across releases.

## Testing Guidelines

Name Node.js tests `tests/*.test.js`; use the built-in `node:test` framework. Add focused regression checks for changed behavior. Browser checks cover supported question types, layout variants, navigation, settings, and failure paths without real API calls. Verify production behavior manually in ScriptCat; headless Chromium does not exercise extension permissions.

## Commit & Pull Request Guidelines

Use concise imperative messages with prefixes such as `feat:`, `docs:`, or `chore:`. Work on `dev`; describe behavior changes, link relevant issues, report checks, and attach screenshots for panel changes. Include the rebuilt bundle when changing runtime code or metadata. Keep package, metadata, and README versions consistent.

## Security & Agent Instructions

Never commit credentials or real API responses containing private questions. Request only required domains and preserve network error handling. Use `sudo -A` for administrator commands; never pass passwords through stdin, override `SUDO_ASKPASS`, or store passwords. Use `sudo -k -A` when fresh confirmation is required for every root command.
