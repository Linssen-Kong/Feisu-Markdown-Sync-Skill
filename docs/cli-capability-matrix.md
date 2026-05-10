# Feishu CLI Capability Matrix

Baseline: `lark-cli >= 1.0.27`

| Area | Status | Adopted CLI commands | Project behavior |
| --- | --- | --- | --- |
| Docs | Verified in cloud | `docs +create/+fetch/+update --api-version v2` | Use v2 for focused document edits and validation documents. |
| Sheets export | Verified in cloud | `sheets +export --file-extension xlsx\|csv` | Preserve top-level Sheet pages as workbook, CSV, and Markdown previews. |
| Sheets write-back | Verified in cloud | `sheets +write`, `sheets +append`, `sheets +read` | `scripts/import_feishu_sheet.cjs` writes explicit ranges and verifies by read-back. |
| Sheets management | Cloud verified | `sheets +info/+create-sheet/+copy-sheet/+update-sheet/+delete-sheet` | `scripts/feishu_cli_tools.cjs` exposes sheet management; delete requires explicit confirmation. |
| Drive | Pending | `drive +pull/+push/+status`, `drive +search` | Evaluate as a future sync substrate; do not replace wiki export yet. |
| Drive-native Markdown | Cloud verified | `markdown +create/+fetch/+overwrite` | `scripts/feishu_markdown_file.cjs` manages Drive `.md` files only; it does not replace doc/wiki sync. |
| Drive comments | Cloud verified | `drive +add-comment` | Supports doc/docx/sheet/slides/wiki comments and relies on CLI preflight for large comment payloads. |
| Media | Verified in earlier releases | `docs +media-insert --selection-with-ellipsis` | Restore local images and non-Markdown files at Markdown positions. |
| Whiteboard text drawing | Cloud verified | `whiteboard +query/+update`, `docs +whiteboard-update` | Export with code/raw fallback; `scripts/feishu_text_diagram.cjs` updates live whiteboards from Mermaid/PlantUML. |
| Text-drawing add-ons | Unsupported | `docs +create/+update/+fetch --api-version v2` | Cloud validation showed doc v2 `<add-ons>` produced no live block and did not appear in fetched XML. Preserve as code or use whiteboard. |
| Base records | Cloud verified | `base +record-get/+record-delete` | Batch record reads/deletes are available through guarded wrappers; delete requires explicit confirmation. |
| Task attachments | Permission blocked | `task +upload-attachment` | Real validation is blocked until tenant approval grants `task:attachment:write`. |
| IM search | Permission blocked | `im +messages-search` | Real validation is blocked until tenant approval grants `search:message`. |
| Config bind | Not cloud-verified by design | `config bind --source lark-channel` | Binding requires explicit confirmation and identity policy selection. |
| Sync shell | Implemented locally | `feishu_sync.cjs status/plan/pull/push/refresh` | Tracks editable, format, and baseline layers; guarded push blocks unsafe format conflicts. |

## Sheet Write-Back Rules

- The caller must provide `--range`; implicit whole-sheet writes are not allowed.
- v1.6.0 supports one spreadsheet, one sheet, one explicit range per command.
- Input can be CSV or a JSON 2D array.
- `write` overwrites the target range; `append` appends rows to the requested range.
- Every non-dry-run write must read back the target range and verify the written values.
- Transient read-back failures such as EOF are retried before the script fails.
- CSV/Sheet write-back is separate from Markdown document import and uses different conflict rules.

## Format Sync Rules

- Markdown and CSV are the human-editable layer.
- XML, XLSX, `format-map.json`, `sheet-format.json`, and raw JSON are the format-preserving layer.
- `.feishu-sync/manifest.json` is the baseline layer.
- Format-layer local edits are treated as unsafe for automatic push and produce conflict reports.
- Markdown overwrite is blocked for documents with rich format blocks in `format-map.json`; this prevents callout/table/checkbox style loss.

## Markdown Boundary Rules

- `lark-cli markdown` is for Drive-native `.md` files only.
- doc/wiki export, import, format snapshots, media restore, and guarded sync stay on the existing `docs`/`wiki` path.
- Use `scripts/feishu_markdown_file.cjs` for Drive `.md` file create/fetch/overwrite, and use `scripts/import_feishu_markdown.cjs` only when writing a local Markdown body back into a Feishu docx.

## lark-cli v1.0.24-v1.0.27 Intake

- `v1.0.24`: sheet management shortcuts, Base batch record get/delete, task attachment upload, Drive comment preflight, Markdown create URL output.
- `v1.0.25`: skills version drift notice and unified update flow.
- `v1.0.26`: IM `message_app_link`, auth missing-scope hints, Base error cleanup, whiteboard `+update` write-risk classification.
- `v1.0.27`: `config bind --source lark-channel`, install fallback improvements for PowerShell-disabled environments, task member id documentation.
