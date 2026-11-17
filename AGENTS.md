# Repository Guidelines

## Project Structure & Module Organization

- `U-plus-Assistant.user.js` contains the browser UI, question detection, DeepSeek requests, and question-bank integration. UI styles are embedded in JavaScript.
- `README.md` covers installation and usage.
- `bank-server/` is a local Flask/SQLite companion excluded by `.gitignore`. It contains `app.py`, administration/import tools under `tools/`, HTML assets under `admin_static/`, and runtime databases under `data/`. Do not force-add this private directory.

## Build, Test, and Development Commands

The userscript requires no build step. Install or reload it in Tampermonkey or Violentmonkey, then open `https://www.eduplus.net/course/workAnswer/*`.

- `node --check U-plus-Assistant.user.js` checks JavaScript syntax when Node.js is available.
- For the optional server, run these commands from `bank-server/`:

  ```sh
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  .venv/bin/python tools/manage.py create-admin
  .venv/bin/python tools/manage.py create-key --name local --calls -1
  HOST=127.0.0.1 .venv/bin/python app.py
  ```

- `curl http://127.0.0.1:5000/api/health` checks server availability.
- Alternatively, `docker compose up -d --build` builds and starts the companion from `bank-server/`.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single-quoted strings, and camelCase functions/variables in JavaScript. Keep constants in UPPER_SNAKE_CASE and preserve the userscript metadata block. Python uses four-space indentation and snake_case. Follow surrounding code; no formatter or linter is configured. Keep fixes focused and reuse existing helpers.

## Testing Guidelines

No automated test suite or coverage threshold is configured. Manually verify affected single-choice, multiple-choice, true/false, and fill-in-the-blank flows, plus automatic/manual mode and settings persistence. For bank changes, check cache hits, misses, uploads, and authentication failures using a disposable database selected through `DB_PATH`. Record verification steps and results in the PR.

## Commit & Pull Request Guidelines

History uses concise prefixes such as `feat:` and `docs:`. Follow that style with an imperative summary. Describe the behavior changed, link relevant issues, list checks performed, and attach screenshots for panel changes. Keep unrelated local edits out of commits.

## Security & Agent Instructions

Never commit API keys, credentials, or SQLite data. Keep local servers bound to loopback and configure `SESSION_SECRET` for deployments. For administrator commands, use `sudo -A`; never pass passwords through stdin, override `SUDO_ASKPASS`, or store passwords. Use `sudo -k -A` when the user requires fresh confirmation for each root command.
