# Validation Log

## 2026-05-10 - v1.6.0 Local And Cloud Upgrade Validation

Local environment:

- `lark-cli`: `1.0.27`

Local checks:

- `node scripts/feishu_cli_tools.cjs doctor` reports the active CLI version and adopted upgrade areas.
- `scripts/feishu_markdown_file.cjs` supports Drive-native Markdown `create/fetch/overwrite` wrappers separately from doc/wiki sync.
- `scripts/feishu_text_diagram.cjs` supports whiteboard Mermaid/PlantUML dry-run updates and experimental doc `<add-ons>` verification.
- High-risk wrappers require explicit confirmation: Sheet delete, Base record delete, and config bind.

Cloud artifact:

- Drive-native Markdown file: `codex-lark-cli-1027-validation-20260510-115339.md`
  - URL: `<redacted-feishu-file-url>`
  - File token: `<redacted-file-token>`
- Validation doc: `Codex lark-cli 1.0.27 全功能验证 - 20260510-115643`
  - URL: `<redacted-feishu-doc-url>`
  - Doc token: `<redacted-doc-token>`
- Validation whiteboard:
  - Whiteboard token: `<redacted-whiteboard-token>`
- Validation sheet: `Codex lark-cli 1.0.27 Sheet 验证 - 20260510-115819`
  - URL: `<redacted-feishu-sheet-url>`
  - Spreadsheet token: `<redacted-spreadsheet-token>`
  - Created sheet id: `<redacted-sheet-id>`
  - Copied and deleted sheet id: `<redacted-sheet-id>`
- Validation Base: `Codex lark-cli 1.0.27 Base 验证 - 20260510-115911`
  - URL: `<redacted-feishu-base-url>`
  - Base token: `<redacted-base-token>`
  - Table id: `<redacted-table-id>`
- Validation task:
  - URL: `<redacted-feishu-task-url>`
  - Task guid: `<redacted-task-guid>`

Cloud results:

- Markdown create through `scripts/feishu_markdown_file.cjs create`: passed.
- Markdown fetch through `scripts/feishu_markdown_file.cjs fetch`: passed; fetched content matched the created body.
- Markdown overwrite through `scripts/feishu_markdown_file.cjs overwrite`: passed and returned a new file version.
- Markdown fetch after overwrite: passed; fetched content contained `status: overwrite verified`.
- Drive comment through `scripts/feishu_cli_tools.cjs drive add-comment`: passed on the validation doc.
- Sheet info/create-sheet/copy-sheet/update-sheet/delete-sheet through `scripts/feishu_cli_tools.cjs`: passed on the validation spreadsheet. Delete was verified on a copied temporary sheet only.
- Base record-get and record-delete through `scripts/feishu_cli_tools.cjs`: passed on temporary records.
- Whiteboard create through `docs +update` plus Mermaid write/query through `scripts/feishu_text_diagram.cjs`: passed. Query returned the written Mermaid source.
- Doc `<add-ons>` verification through `scripts/feishu_text_diagram.cjs doc-addons-verify`: executed against the validation doc; write returned `ok: true` but service result `failed` with warning `Instruction produced no document changes`, and fetched XML did not contain `<add-ons>`. Conclusion: doc add-ons are still not live round-trippable.
- Task attachment upload through `scripts/feishu_cli_tools.cjs task upload-attachment`: blocked by missing `task:attachment:write`; authorization request returned `The requested permissions are already under review`.
- IM message search through `scripts/feishu_cli_tools.cjs im messages-search`: blocked by missing `search:message`; authorization request returned `The requested permissions are already under review`.

Cloud validation note:

- Drive-native Markdown file create/fetch/overwrite is cloud-verified on `lark-cli 1.0.27`.
- Drive comments, Sheet management, Base record read/delete, and whiteboard Mermaid updates are cloud-verified on temporary resources.
- Task attachment upload and IM message search require tenant approval for their scopes before they can be validated.
- Doc `<add-ons>` was cloud-tested and remains unavailable for live round-trip in this tenant.

## 2026-05-04 - v1.4.0 Cloud Validation

Local environment:

- `lark-cli`: `1.0.23`
- Validation files are intentionally kept in Feishu cloud docs for manual review.

Cloud artifacts:

- Sheet: `Codex Feishu CLI v1.0.23 Sheet 验证 - 2026-05-04`
  - URL: `<redacted-feishu-sheet-url>`
  - Sheet id: `f97139`
- Doc: `Codex Feishu CLI v1.0.23 文本绘图验证 - 2026-05-04`
  - URL: `<redacted-feishu-doc-url>`

Results:

- Sheet create with headers and initial rows: passed.
- Sheet write-back with `sheets +write` to `A2:C3`: passed.
- Sheet append with `sheets +append` to `A:C`: passed.
- CSV file write-back to `A6:C7`: passed after retrying one transient EOF during read-back.
- Sheet read-back verification after writes: passed.
- Sheet CSV export: passed, saved `.tmp/codex-sheet-validation.csv`.
- Sheet XLSX export: passed, saved `.tmp/codex-sheet-validation.xlsx`.
- Text-drawing `<add-ons>` create/update through docs v2: commands returned success and no warnings.
- Text-drawing fetch verification: live `<add-ons>` blocks were not preserved in fetched XML.

Conclusion:

- Sheet bidirectional write-back is verified for explicit ranges on `lark-cli v1.0.23`.
- Text-drawing add-ons remain text-preservation only; live round-trip is not verified.

## 2026-05-04 - v1.5.0 Sync Shell Validation

Cloud artifact:

- Wiki node: `<redacted-feishu-wiki-url>`
- Doc token: `<redacted-doc-token>`

Results:

- Created a personal-library Wiki doc for validation.
- Wrote rich XML content containing `callout`, `checkbox`, `table`, and Mermaid code.
- `feishu_sync.cjs pull` generated Markdown, `*.assets/*.format.xml`, `format-map.json`, and `.feishu-sync/manifest.json`.
- `feishu_sync.cjs status` reported clean after pull.
- `audit_feishu_export.cjs` reported zero raw-only resources and zero missing format maps.
- A local Markdown edit followed by `push --apply` was blocked in the first guarded implementation because the document contains rich format blocks; a conflict report was generated instead of overwriting Feishu formatting.
- `compile_feishu_doc_xml.cjs` then merged local Markdown edits into the XML format snapshot for the rich-format test document. XML overwrite applied the Markdown edits while preserving `callout`, `checkbox`, `table`, and `pre` blocks.

Conclusion:

- v1.5.0 pull/status/audit format snapshot flow is verified against a real Wiki node.
- Guarded push now has the required Markdown-to-XML consistency step for supported rich blocks; unsupported structural changes still block.
