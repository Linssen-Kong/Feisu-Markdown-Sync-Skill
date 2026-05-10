# Security And Privacy Check

Date: 2026-05-10

Purpose: make the repository safe to publish to GitHub after the `lark-cli >= 1.0.27` upgrade and cloud validation work.

## Result

- Public docs no longer contain real Feishu tenant URLs, validation file URLs, document tokens, spreadsheet tokens, Base tokens, whiteboard tokens, task GUIDs, or comment IDs.
- `.env`, `.env.*`, `.tmp/`, `exports/`, `node_modules/`, and `.feishu-sync/secrets.local.json` are ignored by `.gitignore`.
- `.env.example` contains placeholders only.
- Export behavior is privacy-first by default: sensitive metadata is omitted unless `FEISHU_INCLUDE_SENSITIVE_METADATA=true`.
- Token placeholders are redacted by default unless `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=true`.

## Code Review Notes

- CLI calls use `spawnSync` with argument arrays; no wrapper uses `shell: true`.
- High-risk wrapper actions are gated:
  - `sheet delete-sheet` requires `--yes` or `--dry-run`.
  - `base record-delete` requires `--yes` or `--dry-run`.
  - `config bind` requires `--confirm-bind` and explicit `--identity`.
- `scripts/feishu_text_diagram.cjs` now reports doc v2 `<add-ons>` live round-trip as unsupported unless a future non-dry-run validation proves otherwise.
- Temporary import files are written under `.tmp/` and removed best-effort by `scripts/import_feishu_markdown.cjs`.
- Real cloud validation artifacts are recorded only in redacted form.

## Known Publishing Caveats

- Generated exports may contain organization content if a user explicitly commits files under `exports/`; keep `exports/` ignored.
- Running export with `FEISHU_INCLUDE_SENSITIVE_METADATA=true` can write raw tokens into local export metadata. Do not publish those generated outputs.
- Running export with `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=true` can preserve source tokens in placeholder text. Do not publish those generated outputs.
- `LARK_CLI_PATH` is intentionally configurable; use trusted local paths only.

## Scan Commands Used

```powershell
rg -n "<known-tenant-domain>|www\.feishu\.cn/(file|wiki)|applink\.feishu|[A-Za-z0-9]{20,}" README.md SKILL.md docs scripts .env.example .gitignore agents
rg -n "appSecret|client_secret|tenant_access_token|user_access_token|refresh_token|authorization:|Bearer |PRIVATE KEY|BEGIN RSA|password\s*=|secret\s*=|FEISHU_.*TOKEN=.*[^<]" -i . --glob "!exports/**" --glob "!.tmp/**" --glob "!node_modules/**"
rg -n "shell:\s*true|eval\(|Function\(|Remove-Item|rm -rf|git reset --hard|git checkout --" scripts README.md SKILL.md docs
```

Remaining hits from the broad token regex are code identifiers, placeholder names, or deliberate redacted markers rather than publishable secrets.
