function escapePdfText(input) {
  return String(input || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapParagraph(text, maxChars = 90) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (candidate.length > maxChars) {
      lines.push(current);
      current = words[i];
    } else {
      current = candidate;
    }
  }

  lines.push(current);
  return lines;
}

function blockToWrappedLines(text, maxChars = 90) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((raw) => {
      const row = raw.trim();
      if (!row) return [""];
      return wrapParagraph(row, maxChars);
    });
}

function createLayoutLines({ title, description, problemStatement, generatedAtIso }) {
  const prettyGeneratedAt = new Date(generatedAtIso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = [];
  const push = (text, options = {}) => rows.push({ text, ...options });

  push("Challenge Accepted - AI Generated Challenge", { font: "F2", size: 14, gapAfter: 8 });
  push(title, { font: "F2", size: 18, gapAfter: 12 });

  push(`Generated at: ${prettyGeneratedAt}`, { font: "F1", size: 10, gapAfter: 16 });

  push("Overview", { font: "F2", size: 12, gapAfter: 6 });
  blockToWrappedLines(description, 94).forEach((line) => {
    push(line, { font: "F1", size: 11, gapAfter: line ? 3 : 8 });
  });

  push("Problem Statement", { font: "F2", size: 12, gapAfter: 6 });
  blockToWrappedLines(problemStatement, 94).forEach((line) => {
    push(line, { font: "F1", size: 11, gapAfter: line ? 3 : 8 });
  });

  return rows;
}

function splitIntoPages(layoutLines) {
  const pageHeight = 792;
  const top = pageHeight - 50;
  const bottom = 50;

  const pages = [];
  let current = [];
  let cursorY = top;

  for (const row of layoutLines) {
    const fontSize = row.size || 11;
    const lineHeight = Math.round(fontSize * 1.35);
    const extraGap = row.gapAfter || 0;
    const required = lineHeight + extraGap;

    if (cursorY - required < bottom && current.length > 0) {
      pages.push(current);
      current = [];
      cursorY = top;
    }

    current.push({
      text: row.text || "",
      font: row.font || "F1",
      size: fontSize,
      x: 50,
      y: cursorY,
    });

    cursorY -= required;
  }

  if (current.length) pages.push(current);
  return pages;
}

function renderPageStream(pageRows) {
  const cmds = [];

  for (const row of pageRows) {
    cmds.push("BT");
    cmds.push(`/${row.font} ${row.size} Tf`);
    cmds.push(`1 0 0 1 ${row.x} ${Math.max(0, Math.round(row.y))} Tm`);
    cmds.push(`(${escapePdfText(row.text)}) Tj`);
    cmds.push("ET");
  }

  return cmds.join("\n");
}

export function buildChallengePdfBuffer({ title, description, problemStatement, generatedAtIso }) {
  const layout = createLayoutLines({ title, description, problemStatement, generatedAtIso });
  const pages = splitIntoPages(layout);
  const streams = pages.map(renderPageStream);

  const objects = [];
  objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";

  const pageObjectIds = [];
  const contentObjectIds = [];
  let nextId = 5;

  for (let i = 0; i < streams.length; i++) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjectIds.push(pageId);
    contentObjectIds.push(contentId);
  }

  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
  objects[4] = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";

  for (let i = 0; i < pageObjectIds.length; i++) {
    const pageId = pageObjectIds[i];
    const contentId = contentObjectIds[i];
    const streamData = streams[i];

    objects[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`;
  }

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [0];

  for (let id = 1; id < objects.length; id++) {
    const obj = objects[id];
    if (!obj) continue;
    offsets[id] = header.length + body.length;
    body += obj;
  }

  const xrefStart = header.length + body.length;
  const xrefEntries = ["0000000000 65535 f "];
  for (let id = 1; id < offsets.length; id++) {
    const offset = offsets[id] || 0;
    xrefEntries.push(`${String(offset).padStart(10, "0")} 00000 n `);
  }

  const xref = `xref\n0 ${offsets.length}\n${xrefEntries.join("\n")}\n`;
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(`${header}${body}${xref}${trailer}`);
}
