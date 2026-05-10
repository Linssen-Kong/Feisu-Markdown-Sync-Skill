const fs = require("fs");
const path = require("path");

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/compile_feishu_doc_xml.cjs --markdown <doc.md> --format-xml <doc.assets/doc.format.xml> --out <compiled.xml>",
      "  node scripts/compile_feishu_doc_xml.cjs --markdown <doc.md> --format-xml <doc.assets/doc.format.xml> --check",
      "",
      "说明:",
      "  - 将人工编辑的 Markdown 正文合入格式保真的 DocxXML 快照。",
      "  - 当前支持 h1-h6、p、callout、checkbox、table、pre/code 的安全顺序映射。",
      "  - 无法证明安全映射时会失败，避免静默丢格式。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = {
    markdown: "",
    formatXml: "",
    out: "",
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = (name) => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (i + 1 >= argv.length) throw new Error(`${name} 需要一个值`);
      i += 1;
      return argv[i];
    };
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--markdown" || arg.startsWith("--markdown=")) {
      options.markdown = readValue("--markdown");
    } else if (arg === "--format-xml" || arg.startsWith("--format-xml=")) {
      options.formatXml = readValue("--format-xml");
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      options.out = readValue("--out");
    } else if (arg === "--check") {
      options.check = true;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  if (!options.markdown || !options.formatXml) {
    printUsage();
    throw new Error("缺少 --markdown 或 --format-xml");
  }
  if (!options.check && !options.out) {
    printUsage();
    throw new Error("缺少 --out；如只检查请传 --check");
  }
  return options;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return normalizeText(String(value || "").replace(/<[^>]+>/g, " "));
}

function renderInlineMarkdown(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match;
  while ((match = regex.exec(text))) {
    if (match.index > cursor) {
      parts.push(escapeXml(text.slice(cursor, match.index)));
    }
    parts.push(`<b>${escapeXml(match[1])}</b>`);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(escapeXml(text.slice(cursor)));
  }
  return parts.join("");
}

function isFence(line) {
  return /^```/.test(line.trim());
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line.trim());
}

function isCheckbox(line) {
  return /^-\s+\[[ xX]\]\s+/.test(line.trim());
}

function isTableStart(lines, index) {
  if (!lines[index] || !lines[index].includes("|") || !lines[index + 1]) return false;
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function isCalloutStart(line) {
  return /^<callout\b/i.test(line.trim());
}

function isSpecialStart(lines, index) {
  const line = lines[index] || "";
  return (
    isHeading(line) ||
    isCheckbox(line) ||
    isFence(line) ||
    isCalloutStart(line) ||
    isTableStart(lines, index)
  );
}

function stripExportChrome(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (!isHeading(lines[0] || "")) return lines;
  const nodeTypeIndex = lines.slice(1, 6).findIndex((line) => /^-\s+节点类型:\s+/.test(line.trim()));
  if (nodeTypeIndex === -1) return lines;
  let index = nodeTypeIndex + 2;
  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }
  return lines.slice(index);
}

function splitTableRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function parseMarkdown(markdown) {
  const lines = stripExportChrome(markdown);
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;

    if (isHeading(line)) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
      blocks.push({ type: `h${match[1].length}`, text: match[2].trim() });
      continue;
    }

    if (isCalloutStart(line)) {
      const raw = [line];
      while (i + 1 < lines.length && !/<\/callout>/i.test(lines[i])) {
        i += 1;
        raw.push(lines[i]);
      }
      const rawXml = raw.join("\n");
      blocks.push({ type: "callout", text: stripTags(rawXml), raw: rawXml });
      continue;
    }

    if (isCheckbox(line)) {
      const match = /^-\s+\[([ xX])\]\s+(.*)$/.exec(line.trim());
      blocks.push({ type: "checkbox", done: match[1].toLowerCase() === "x", text: match[2].trim() });
      continue;
    }

    if (isTableStart(lines, i)) {
      const rows = [splitTableRow(lines[i])];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }

    if (isFence(line)) {
      const lang = line.trim().replace(/^```/, "").trim();
      const code = [];
      while (i + 1 < lines.length) {
        i += 1;
        if (isFence(lines[i])) break;
        code.push(lines[i]);
      }
      blocks.push({ type: "pre", lang, code: code.join("\n") });
      continue;
    }

    const paragraph = [line.trim()];
    while (i + 1 < lines.length && lines[i + 1].trim() !== "" && !isSpecialStart(lines, i + 1)) {
      i += 1;
      paragraph.push(lines[i].trim());
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }
  return blocks;
}

function splitTopLevelBlocks(xml) {
  const blocks = [];
  const regex = /<([a-zA-Z][\w-]*)([^>]*)\bid="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z][\w-]*)([^>]*)\bid="([^"]+)"([^>]*)\/>/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(xml))) {
    if (match.index > lastIndex && xml.slice(lastIndex, match.index).trim()) {
      throw new Error("XML 中存在无法识别的顶层片段，停止合并");
    }
    const tag = match[1] || match[6];
    const id = match[3] || match[8];
    blocks.push({
      tag,
      raw: match[0],
      attrs: `${match[2] || ""} id="${id}"${match[4] || ""}${match[7] || ""}${match[9] || ""}`,
      content: match[5] || "",
    });
    lastIndex = regex.lastIndex;
  }
  if (xml.slice(lastIndex).trim()) {
    throw new Error("XML 末尾存在无法识别的片段，停止合并");
  }
  return blocks;
}

function setAttr(rawAttrs, name, value) {
  const attrs = rawAttrs || "";
  const escaped = String(value).replace(/"/g, "&quot;");
  if (new RegExp(`\\b${name}="[^"]*"`).test(attrs)) {
    return attrs.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${escaped}"`);
  }
  return `${attrs} ${name}="${escaped}"`;
}

function renderSimpleBlock(xmlBlock, mdBlock) {
  if (/^h[1-6]$/.test(xmlBlock.tag)) {
    return `<${xmlBlock.tag}${xmlBlock.attrs}>${escapeXml(mdBlock.text)}</${xmlBlock.tag}>`;
  }
  if (xmlBlock.tag === "p") {
    return `<p${xmlBlock.attrs}>${renderInlineMarkdown(mdBlock.text)}</p>`;
  }
  if (xmlBlock.tag === "checkbox") {
    const attrs = setAttr(xmlBlock.attrs, "done", mdBlock.done ? "true" : "false");
    return `<checkbox${attrs}>${escapeXml(mdBlock.text)}</checkbox>`;
  }
  if (xmlBlock.tag === "pre") {
    const attrs = mdBlock.lang && !/\blang="/.test(xmlBlock.attrs)
      ? setAttr(xmlBlock.attrs, "lang", mdBlock.lang)
      : xmlBlock.attrs;
    return `<pre${attrs}><code>${escapeXml(mdBlock.code)}</code></pre>`;
  }
  throw new Error(`不支持的简单块: ${xmlBlock.tag}`);
}

function renderCallout(xmlBlock, mdBlock) {
  const paragraph = /<p([^>]*)>[\s\S]*?<\/p>/.exec(xmlBlock.content);
  const content = paragraph
    ? xmlBlock.content.replace(/<p([^>]*)>[\s\S]*?<\/p>/, `<p${paragraph[1]}>${renderInlineMarkdown(mdBlock.text)}</p>`)
    : `<p>${renderInlineMarkdown(mdBlock.text)}</p>`;
  return `<callout${xmlBlock.attrs}>${content}</callout>`;
}

function collectCells(rowXml) {
  const cells = [];
  const regex = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = regex.exec(rowXml))) {
    const pMatch = /<p([^>]*)>[\s\S]*?<\/p>/.exec(match[3]);
    cells.push({
      tag: match[1],
      attrs: match[2],
      pAttrs: pMatch ? pMatch[1] : "",
    });
  }
  return cells;
}

function renderTable(xmlBlock, mdBlock) {
  const rowMatches = [...xmlBlock.content.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  if (rowMatches.length !== mdBlock.rows.length) {
    throw new Error(`表格行数不一致: XML ${rowMatches.length}, Markdown ${mdBlock.rows.length}`);
  }
  const colgroup = xmlBlock.content.match(/<colgroup>[\s\S]*?<\/colgroup>/)?.[0] || "";
  const renderedRows = mdBlock.rows.map((row, rowIndex) => {
    const cells = collectCells(rowMatches[rowIndex][1]);
    if (cells.length !== row.length) {
      throw new Error(`表格第 ${rowIndex + 1} 行列数不一致: XML ${cells.length}, Markdown ${row.length}`);
    }
    const renderedCells = row.map((cell, cellIndex) => {
      const source = cells[cellIndex];
      return `<${source.tag}${source.attrs}><p${source.pAttrs}>${renderInlineMarkdown(cell)}</p></${source.tag}>`;
    });
    return `<tr>${renderedCells.join("")}</tr>`;
  });
  const hasThead = /<thead>/.test(xmlBlock.content);
  if (hasThead && renderedRows.length) {
    return `<table${xmlBlock.attrs}>${colgroup}<thead>${renderedRows[0]}</thead><tbody>${renderedRows.slice(1).join("")}</tbody></table>`;
  }
  return `<table${xmlBlock.attrs}>${colgroup}<tbody>${renderedRows.join("")}</tbody></table>`;
}

function compatible(xmlBlock, mdBlock) {
  if (!xmlBlock || !mdBlock) return false;
  if (/^h[1-6]$/.test(xmlBlock.tag) && /^h[1-6]$/.test(mdBlock.type)) return true;
  return xmlBlock.tag === mdBlock.type;
}

function compile(markdown, xml) {
  const mdBlocks = parseMarkdown(markdown);
  const xmlBlocks = splitTopLevelBlocks(xml);
  const compiled = [];
  const changes = [];
  let cursor = 0;
  for (const mdBlock of mdBlocks) {
    while (cursor < xmlBlocks.length && xmlBlocks[cursor].tag === "title") {
      compiled.push(xmlBlocks[cursor].raw);
      cursor += 1;
    }
    const xmlBlock = xmlBlocks[cursor];
    if (!compatible(xmlBlock, mdBlock)) {
      throw new Error(`块映射失败: Markdown ${mdBlock.type} 无法匹配 XML ${xmlBlock?.tag || "EOF"}`);
    }
    let nextRaw;
    if (mdBlock.type === "callout") {
      nextRaw = renderCallout(xmlBlock, mdBlock);
    } else if (mdBlock.type === "table") {
      nextRaw = renderTable(xmlBlock, mdBlock);
    } else {
      nextRaw = renderSimpleBlock(xmlBlock, mdBlock);
    }
    if (normalizeText(stripTags(xmlBlock.raw)) !== normalizeText(stripTags(nextRaw))) {
      changes.push({
        index: cursor,
        type: xmlBlock.tag,
        before: normalizeText(stripTags(xmlBlock.raw)).slice(0, 160),
        after: normalizeText(stripTags(nextRaw)).slice(0, 160),
      });
    }
    compiled.push(nextRaw);
    cursor += 1;
  }
  while (cursor < xmlBlocks.length) {
    compiled.push(xmlBlocks[cursor].raw);
    cursor += 1;
  }
  return {
    xml: `${compiled.join("")}\n`,
    markdownBlocks: mdBlocks.length,
    xmlBlocks: xmlBlocks.length,
    changes,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = fs.readFileSync(path.resolve(options.markdown), "utf8");
  const xml = fs.readFileSync(path.resolve(options.formatXml), "utf8");
  const result = compile(markdown, xml);
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(path.resolve(options.out), result.xml, "utf8");
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        markdownBlocks: result.markdownBlocks,
        xmlBlocks: result.xmlBlocks,
        changedBlocks: result.changes.length,
        changes: result.changes,
        out: options.out ? path.resolve(options.out) : null,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
