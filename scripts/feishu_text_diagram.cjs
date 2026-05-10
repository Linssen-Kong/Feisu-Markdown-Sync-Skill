#!/usr/bin/env node
const crypto = require("crypto");
const {
  assertMinimumLarkCliVersion,
  printJson,
  readOptionValue,
  runLark,
  toCliRelativePath,
} = require("./lib/lark_cli.cjs");

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/feishu_text_diagram.cjs whiteboard query --whiteboard-token <token> --output-as code|raw|image [--output <dir>] [--as user|bot]",
      "  node scripts/feishu_text_diagram.cjs whiteboard update --whiteboard-token <token> --source <@file|-> --input-format mermaid|plantuml|raw [--overwrite] [--apply] [--as user|bot]",
      "  node scripts/feishu_text_diagram.cjs doc-addons-verify --doc <docx_url_or_token> [--source <@file|->] [--as user|bot] [--dry-run]",
      "",
      "说明:",
      "  - 正式文本绘图路径是 Mermaid/PlantUML 写入飞书白板。",
      "  - doc-addons-verify 只用于证明 doc v2 <add-ons> 是否可写入并从 XML 回读；当前租户云端验证结果是不支持 live round-trip。",
      "  - whiteboard update 传 --overwrite 时默认 dry-run；确认后再传 --apply 执行。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }
  const key = argv[0] === "doc-addons-verify" ? argv[0] : `${argv[0]} ${argv[1] || ""}`.trim();
  const startIndex = key === "doc-addons-verify" ? 1 : 2;
  if (!["whiteboard query", "whiteboard update", "doc-addons-verify"].includes(key)) {
    throw new Error(`未知命令: ${key}`);
  }
  const options = { key, as: "user" };
  const valueOptions = new Set([
    "--whiteboard-token",
    "--output-as",
    "--output",
    "--source",
    "--input-format",
    "--idempotent-token",
    "--doc",
    "--as",
  ]);
  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--overwrite" || arg === "--dry-run" || arg === "--apply") {
      options[arg.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = true;
      continue;
    }
    const optionName = [...valueOptions].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) {
      throw new Error(`未知参数: ${arg}`);
    }
    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    const keyName = optionName.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    options[keyName] = value;
    i = nextIndex;
  }
  if (!["user", "bot"].includes(options.as)) {
    throw new Error("--as 只能是 user 或 bot");
  }
  return options;
}

function normalizeSource(value) {
  if (!value) return "";
  if (value === "-") return "-";
  if (value.startsWith("@")) {
    return `@${toCliRelativePath(value.slice(1))}`;
  }
  return value;
}

function idempotentToken() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function buildWhiteboardQuery(options) {
  if (!options.whiteboardToken) throw new Error("whiteboard query 必须提供 --whiteboard-token");
  if (!["code", "raw", "image"].includes(options.outputAs || "")) {
    throw new Error("--output-as 必须是 code、raw 或 image");
  }
  const args = [
    "whiteboard",
    "+query",
    "--whiteboard-token",
    options.whiteboardToken,
    "--output_as",
    options.outputAs,
    "--as",
    options.as,
  ];
  if (options.output) args.push("--output", toCliRelativePath(options.output));
  return args;
}

function buildWhiteboardUpdate(options) {
  if (!options.whiteboardToken) throw new Error("whiteboard update 必须提供 --whiteboard-token");
  if (!options.source) throw new Error("whiteboard update 必须提供 --source <@file|->");
  if (!["mermaid", "plantuml", "raw"].includes(options.inputFormat || "")) {
    throw new Error("--input-format 必须是 mermaid、plantuml 或 raw");
  }
  const args = [
    "whiteboard",
    "+update",
    "--whiteboard-token",
    options.whiteboardToken,
    "--source",
    normalizeSource(options.source),
    "--input_format",
    options.inputFormat,
    "--idempotent-token",
    options.idempotentToken || idempotentToken(),
    "--as",
    options.as,
  ];
  if (options.overwrite) args.push("--overwrite");
  if (options.dryRun || (options.overwrite && !options.apply)) args.push("--dry-run");
  return args;
}

function defaultAddonsContent() {
  const record = JSON.stringify({
    type: "mermaid",
    data: "flowchart TD\n  A[文本绘图验证] --> B[lark-cli docs v2]\n  B --> C{fetch XML 是否保留 add-ons?}",
  }).replace(/"/g, "&quot;");
  return `<add-ons record="${record}"/>`;
}

function buildDocAddonsVerify(options) {
  if (!options.doc) throw new Error("doc-addons-verify 必须提供 --doc");
  const content = options.source ? normalizeSource(options.source) : defaultAddonsContent();
  const args = [
    "docs",
    "+update",
    "--api-version",
    "v2",
    "--doc",
    options.doc,
    "--command",
    "append",
    "--doc-format",
    "xml",
    "--content",
    content,
    "--as",
    options.as,
  ];
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function verifyDocAddons(options, writeResult) {
  if (options.dryRun) {
    return {
      dryRun: true,
      feature: "doc-addons-live-roundtrip",
      supportStatus: "unsupported-until-proven",
      supported: false,
      reason: "Dry-run only. Cloud validation on 2026-05-10 showed doc v2 <add-ons> produced no document changes and did not appear in fetched XML.",
      writeResult,
    };
  }
  const fetchResult = runLark([
    "docs",
    "+fetch",
    "--api-version",
    "v2",
    "--doc",
    options.doc,
    "--doc-format",
    "xml",
    "--detail",
    "full",
    "--as",
    options.as,
  ]);
  const text = typeof fetchResult === "string" ? fetchResult : JSON.stringify(fetchResult);
  const preserved = /<add-ons\b/i.test(text);
  const serviceResult = writeResult?.data?.result || null;
  const warnings = writeResult?.data?.warnings || [];
  const supported = preserved && serviceResult !== "failed";
  return {
    ok: true,
    feature: "doc-addons-live-roundtrip",
    supportStatus: supported ? "cloud-verified" : "unsupported",
    supported,
    reason: supported
      ? "The add-ons block was preserved in fetched XML."
      : "Cloud validation showed doc v2 <add-ons> is not preserved as a live block; preserve it as Mermaid/text code or use a whiteboard.",
    serviceResult,
    warnings,
    addOnsPreservedInFetchedXml: preserved,
    writeResult,
    fetchResult,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertMinimumLarkCliVersion();
  if (options.key === "whiteboard query") {
    printJson(runLark(buildWhiteboardQuery(options)));
    return;
  }
  if (options.key === "whiteboard update") {
    printJson(runLark(buildWhiteboardUpdate(options)));
    return;
  }
  const writeResult = runLark(buildDocAddonsVerify(options));
  printJson(verifyDocAddons(options, writeResult));
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
