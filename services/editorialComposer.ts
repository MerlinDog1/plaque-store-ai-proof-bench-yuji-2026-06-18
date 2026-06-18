import { AVAILABLE_FONTS, DesignStyle, Shape, STYLE_FONT_PALETTES } from "../types";

export interface ComposerBox {
  width: number;
  height: number;
}

export interface ComposerResult {
  svgContent: string;
  profile: ComposerProfile;
  score: number;
  bodySize: number;
  headingSize: number;
  reasoning: string;
}

type ComposerRole = "title" | "subtitle" | "date" | "body" | "accent" | "spacer";
type ComposerProfile = "editorial-column" | "ceremonial-stack" | "balanced-tribute";

interface ComposerBlock {
  role: ComposerRole;
  text: string;
  literalLine?: boolean;
}

interface ComposedBlock extends ComposerBlock {
  lines: string[];
  size: number;
  lineHeight: number;
  font: string;
  weight: number;
  italic: boolean;
  anchor: "start" | "middle";
  x: number;
}

interface Candidate {
  profile: ComposerProfile;
  blocks: ComposedBlock[];
  score: number;
  bodySize: number;
  headingSize: number;
  widthUse: number;
  heightUse: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();
const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function glyphUnits(text: string) {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.29;
    if (/[ilI1'.,:;!|]/.test(char)) return sum + 0.28;
    if (/[mwMW@%&]/.test(char)) return sum + 0.88;
    if (/[A-Z0-9]/.test(char)) return sum + 0.64;
    return sum + 0.52;
  }, 0);
}

function estimateWidth(text: string, fontSize: number, spacing = 0) {
  return fontSize * (glyphUnits(text) + Math.max(0, text.length - 1) * spacing);
}

function wrapMeasured(text: string, size: number, maxWidth: number) {
  const words = normalizeSpace(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && estimateWidth(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);

  if (lines.length > 1) {
    const last = lines.at(-1)!.split(" ");
    const previous = lines.at(-2)!.split(" ");
    if (last.length === 1 && previous.length > 2) {
      last.unshift(previous.pop()!);
      lines[lines.length - 2] = previous.join(" ");
      lines[lines.length - 1] = last.join(" ");
    }
  }
  return lines.length ? lines : [text];
}

function sentenceParts(text: string) {
  return normalizeSpace(text).split(/(?<=[.!?])\s+/).map(normalizeSpace).filter(Boolean);
}

function isDateLine(text: string) {
  return /^(?:\D*\b)?\d{3,4}\b.*\b\d{2,4}\b(?:\D*)$/.test(text);
}

function splitMemorialTail(text: string): ComposerBlock[] {
  const blocks: ComposerBlock[] = [];
  for (const part of sentenceParts(text)) {
    if (isDateLine(part)) {
      blocks.push({ role: "date", text: part });
      continue;
    }

    const emotionalMatch = part.match(/^(.*?)(?:,\s*)?\b(and\s+forever\b.*|forever\b.*|always\b.*|with\s+love\b.*)$/i);
    if (emotionalMatch && emotionalMatch[1].trim().length > 8) {
      const bodyText = emotionalMatch[1].trim();
      const consumedComma = /,\s*(?:and\s+forever|forever|always|with\s+love)\b/i.test(part);
      blocks.push({ role: "body", text: consumedComma && !bodyText.endsWith(",") ? `${bodyText},` : bodyText });
      blocks.push({ role: "accent", text: emotionalMatch[2].trim() });
      continue;
    }

    blocks.push({
      role: /heart|remember|love|forever/i.test(part) ? "accent" : "body",
      text: part,
    });
  }
  return blocks;
}

function parseExplicitLineInscription(inscription: string): ComposerBlock[] {
  const lines = inscription.replace(/\r\n?/g, "\n").split("\n");
  const nonBlankIndexes = lines
    .map((line, index) => ({ line: normalizeSpace(line), index }))
    .filter(item => item.line);
  if (nonBlankIndexes.length <= 1) return [];
  const firstTextIndex = nonBlankIndexes[0].index;

  return lines.map((rawLine, index): ComposerBlock => {
    const text = normalizeSpace(rawLine);
    if (!text) return { role: "spacer", text: "", literalLine: true };
    if (index === firstTextIndex && text.length <= 52) return { role: "title", text, literalLine: true };
    if (isDateLine(text)) return { role: "date", text, literalLine: true };
    if (text.length <= 54 && /heart|remember|love|forever|beloved/i.test(text)) {
      return { role: "accent", text, literalLine: true };
    }
    return { role: "body", text, literalLine: true };
  });
}

function parseInscription(inscription: string): ComposerBlock[] {
  const explicitLineBlocks = parseExplicitLineInscription(inscription);
  if (explicitLineBlocks.length) return explicitLineBlocks;

  const normalized = normalizeSpace(inscription);
  const explicit = inscription.split(/\n+/).map(normalizeSpace).filter(Boolean);
  const memorial = normalized.match(/^(in\s+(?:loving\s+)?memory\s+of)\s+([^.]+\.?)\s*(.*)$/i);
  if (memorial) {
    return [
      { role: "subtitle", text: memorial[1] },
      { role: "title", text: memorial[2] },
      ...splitMemorialTail(memorial[3]),
    ];
  }

  if (explicit.length > 1) {
    return explicit.map((text, index): ComposerBlock => {
      if (index === 0 && text.length <= 52) return { role: "title", text };
      if (isDateLine(text)) return { role: "date", text };
      if (text.length <= 54 && /heart|remember|love|forever|beloved/i.test(text)) return { role: "accent", text };
      return { role: "body", text };
    });
  }

  const parts = sentenceParts(normalized);
  if (parts.length > 1) {
    return parts.map((text, index): ComposerBlock => ({
      role: index === 0 && text.length <= 52 ? "title" : "body",
      text,
    }));
  }
  return [{ role: normalized.length <= 52 ? "title" : "body", text: normalized }];
}

function getProfileOrder(blocks: ComposerBlock[]) {
  if (blocks.some(block => block.literalLine)) return ["ceremonial-stack"] as ComposerProfile[];
  const proseLength = blocks.filter(block => block.role === "body").reduce((sum, block) => sum + block.text.length, 0);
  return proseLength > 150
    ? ["editorial-column", "balanced-tribute", "ceremonial-stack"] as ComposerProfile[]
    : ["ceremonial-stack", "balanced-tribute", "editorial-column"] as ComposerProfile[];
}

function fontPalette(style: DesignStyle) {
  const resolved = style === DesignStyle.Auto ? DesignStyle.ClassicalFormal : style;
  const palette = STYLE_FONT_PALETTES[resolved]?.[0] || { title: "Playfair Display", body: "Lato", accent: "Playfair Display" };
  return {
    ...palette,
    accent: SCRIPT_FONT_FAMILIES.has(palette.accent) ? palette.title : palette.accent,
  };
}

const SCRIPT_FONT_FAMILIES = new Set([
  "Alex Brush",
  "Allura",
  "Caveat",
  "Dancing Script",
  "Great Vibes",
  "Pacifico",
  "Pinyon Script",
  "Satisfy",
]);

function makeCandidate(
  sourceBlocks: ComposerBlock[],
  profile: ComposerProfile,
  box: ComposerBox,
  style: DesignStyle,
  bodySize: number,
): Candidate | null {
  const palette = fontPalette(style);
  const literalLines = sourceBlocks.some(block => block.literalLine);
  const memorialNameTitle = sourceBlocks[0]?.role === "subtitle"
    && /memory\s+of/i.test(sourceBlocks[0].text)
    && sourceBlocks.some(block => block.role === "accent")
    && sourceBlocks.find(block => block.role === "title")?.text.length <= 28;
  const dense = sourceBlocks.reduce((sum, block) => sum + block.text.length, 0) > 180;
  const safeWidth = box.width * (profile === "editorial-column" ? 0.96 : 0.91);
  const headingRatio = literalLines ? 1.28 : dense ? 1.68 : memorialNameTitle ? 3.35 : profile === "ceremonial-stack" ? 2.9 : 2.35;
  const headingSize = bodySize * headingRatio;
  const subtitleSize = bodySize * (dense ? 0.94 : 1.02);
  const dateSize = bodySize * 0.96;
  const accentSize = bodySize * (dense ? 1.04 : memorialNameTitle ? 1.18 : 1.3);
  const left = -safeWidth / 2;

  const blocks = sourceBlocks.map((block): ComposedBlock => {
    if (block.role === "spacer") {
      return {
        ...block,
        lines: [],
        size: bodySize,
        lineHeight: 1,
        font: palette.body,
        weight: 400,
        italic: false,
        anchor: "middle",
        x: 0,
      };
    }
    const size = block.role === "title"
      ? headingSize
      : block.role === "subtitle"
        ? subtitleSize
        : block.role === "date"
          ? dateSize
          : block.role === "accent"
            ? accentSize
            : bodySize;
    const prose = block.role === "body" && profile === "editorial-column";
    const maxWidth = safeWidth * (block.role === "title" ? 0.98 : prose ? 1 : 0.94);
    const accentFont = memorialNameTitle ? palette.title : palette.accent;
    return {
      ...block,
      lines: block.literalLine ? [block.text] : wrapMeasured(block.text, size, maxWidth),
      size,
      lineHeight: block.role === "title" ? 1.03 : prose ? 1.2 : 1.14,
      font: block.role === "title" ? palette.title : block.role === "accent" ? accentFont : palette.body,
      weight: block.role === "title" ? 700 : block.role === "subtitle" ? 400 : 400,
      italic: false,
      anchor: prose ? "start" : "middle",
      x: prose ? left : 0,
    };
  });

  const gap = bodySize * (literalLines ? 0.3 : dense ? 0.62 : memorialNameTitle ? 0.78 : profile === "ceremonial-stack" ? 1.15 : 0.88);
  const blockHeights = blocks.map(block => block.role === "spacer" ? block.size * 1.15 : block.size + (block.lines.length - 1) * block.size * block.lineHeight);
  const naturalHeight = blockHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, blocks.length - 1) * gap;
  const widths = blocks.flatMap(block => block.lines.map(line => estimateWidth(line, block.size)));
  const widest = Math.max(0, ...widths);
  if (naturalHeight > box.height * 0.96 || widest > safeWidth * 1.015) return null;

  const proseLines = blocks.filter(block => block.role === "body").flatMap(block => block.lines);
  if (proseLines.some(line => line.split(" ").length === 1 && line.length <= 4)) return null;
  const widthUse = widest / box.width;
  const heightUse = naturalHeight / box.height;
  const bodyFloor = dense ? clamp(Math.min(box.width, box.height) * 0.044, 8, 10) : 5;
  if (bodySize < bodyFloor) return null;

  const targetHeight = dense ? 0.76 : 0.63;
  const targetWidth = dense ? 0.88 : 0.72;
  const score =
    bodySize * (dense ? 3.2 : 1.35)
    - Math.abs(heightUse - targetHeight) * 20
    - Math.abs(widthUse - targetWidth) * 15
    + (profile === (dense ? "editorial-column" : "ceremonial-stack") ? 6 : 0);
  return { profile, blocks, score, bodySize, headingSize, widthUse, heightUse };
}

function renderCandidate(candidate: Candidate, box: ComposerBox) {
  const dense = candidate.blocks.reduce((sum, block) => sum + block.text.length, 0) > 180;
  const literalLines = candidate.blocks.some(block => block.literalLine);
  const memorialNameTitle = candidate.blocks[0]?.role === "subtitle"
    && /memory\s+of/i.test(candidate.blocks[0].text)
    && (candidate.blocks.find(block => block.role === "title")?.text.length || 0) <= 28;
  const gap = candidate.bodySize * (literalLines ? 0.3 : dense ? 0.62 : memorialNameTitle ? 0.78 : candidate.profile === "ceremonial-stack" ? 1.15 : 0.88);
  const heights = candidate.blocks.map(block => block.role === "spacer" ? block.size * 1.15 : block.size + (block.lines.length - 1) * block.size * block.lineHeight);
  const totalHeight = heights.reduce((sum, value) => sum + value, 0) + Math.max(0, candidate.blocks.length - 1) * gap;
  let cursor = -totalHeight / 2;

  return candidate.blocks.map((block, index) => {
    if (block.role === "spacer") {
      cursor += heights[index] + gap;
      return "";
    }
    const firstBaseline = cursor + block.size * 0.82;
    cursor += heights[index] + gap;
    const tspans = block.lines.map((line, lineIndex) =>
      `<tspan x="${block.x.toFixed(2)}" dy="${lineIndex === 0 ? "0" : (block.size * block.lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`
    ).join("");
    return `<text x="${block.x.toFixed(2)}" y="${firstBaseline.toFixed(2)}" text-anchor="${block.anchor}" font-family="${escapeXml(block.font)}" font-size="${block.size.toFixed(2)}" font-weight="${block.weight}"${block.italic ? ` font-style="italic"` : ""} fill="currentColor">${tspans}</text>`;
  }).filter(Boolean).join("\n");
}

export function composeEditorialTypography(
  inscription: string,
  box: ComposerBox,
  shape: Shape,
  style: DesignStyle,
): ComposerResult {
  const clean = normalizeSpace(inscription);
  if (!clean) throw new Error("Inscription is empty");
  const blocks = parseInscription(inscription);
  const dense = clean.length > 180;
  const bodyFloor = dense ? clamp(Math.min(box.width, box.height) * 0.044, 8, 10) : 5;
  const bodyCeiling = clamp(Math.min(box.width, box.height) * (dense ? 0.13 : 0.24), bodyFloor, 44);
  const candidates: Candidate[] = [];

  for (const profile of getProfileOrder(blocks)) {
    for (let size = bodyCeiling; size >= bodyFloor; size -= 0.2) {
      const candidate = makeCandidate(blocks, profile, box, style, Number(size.toFixed(2)));
      if (candidate) {
        candidates.push(candidate);
        break;
      }
    }
  }
  if (!candidates.length) throw new Error("Composer Lab could not fit the inscription above the readable minimum");
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const svgContent = renderCandidate(best, box);
  if (Array.from(svgContent.matchAll(/font-family="([^"]+)"/g)).some(match => !AVAILABLE_FONTS.includes(match[1]))) {
    throw new Error("Composer Lab selected an unsupported font");
  }
  return {
    svgContent,
    profile: best.profile,
    score: best.score,
    bodySize: best.bodySize,
    headingSize: best.headingSize,
    reasoning: `Composer Lab selected ${best.profile} from ${candidates.length} valid recipes. Body ${best.bodySize.toFixed(1)}, heading ${best.headingSize.toFixed(1)}, width use ${(best.widthUse * 100).toFixed(0)}%, height use ${(best.heightUse * 100).toFixed(0)}%.`,
  };
}
