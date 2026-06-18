import { Type } from "@google/genai";
import { AVAILABLE_FONTS, PlaqueState, Shape, Material, Fixing, MemorialImageMethod, DesignStyle, STYLE_FONT_PALETTES, FontPalette, TypographyEngine, TextColor } from "../types";
import { composeEditorialTypography } from "./editorialComposer";
import { getGeminiClient } from "./geminiClient";

const getAIClient = getGeminiClient;

const IMAGE_GENERATION_TIMEOUT_MS = 8 * 60 * 1000;
const REALISTIC_PREVIEW_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const REALISTIC_PREVIEW_IMAGE_SIZE = "4K";

export interface RealisticPreviewOptions {
  prompt?: string;
  aspectRatio?: string;
}

// Retry helper for 503 Overloaded errors
const retryWrapper = async <T>(
  operation: () => Promise<T>,
  retries = 5,
  baseDelay = 2000
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const message = String(error?.message || error || "").toLowerCase();
    const isRetryable =
      error.status === 503 ||
      error.status === 500 ||
      error.code === 503 ||
      error.code === 500 ||
      message.includes("overloaded") ||
      message.includes("internal error") ||
      message.includes('"status":"internal"') ||
      message.includes('"code":500') ||
      message.includes("503") ||
      message.includes("500") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("deadline") ||
      message.includes("network") ||
      error.error?.code === 503 ||
      error.error?.code === 500 ||
      error.error?.status === "INTERNAL" ||
      error.error?.status === "UNAVAILABLE";

    if (retries > 0 && isRetryable) {
      console.warn(`Model request failed with a retryable error. Retrying in ${baseDelay}ms... (${retries} attempts left)`, error);
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      return retryWrapper(operation, retries - 1, baseDelay * 1.5);
    }
    throw error;
  }
};

// ─── Style Archetype Descriptions ────────────────────────────────
const ARCHETYPE_DESCRIPTIONS: Record<Exclude<DesignStyle, DesignStyle.Auto>, string> = {
  [DesignStyle.Monumental]: `MONUMENTAL: One MASSIVE title dominating 70%+ of vertical space. Minimal supporting text below in much smaller size. Heavy font weight (700-900). ALL CAPS title with generous letter-spacing (0.2-0.4em). Think: carved into stone on a Roman building. The title IS the design.`,

  [DesignStyle.ClassicalFormal]: `CLASSICAL FORMAL: Balanced typographic hierarchy with elegant serif fonts. Title in refined serif, body in complementary serif or light sans. Use small-caps for subtitles. Subtle ornamental separators (thin double-rules or em-dash flourishes like "— est. 1847 —"). Symmetrical, centered composition. Think: an invitation to a state dinner.`,

  [DesignStyle.ModernMinimal]: `MODERN MINIMAL: Clean sans-serif throughout. Generous whitespace — text occupies only 50-60% of safe area. Light font weights (300-400) with one bold accent. NO decorative lines or ornaments. Hierarchy through size contrast alone. Lowercase or Title Case preferred. Think: a premium Apple product label.`,

  [DesignStyle.HeritagePlaque]: `HERITAGE PLAQUE: Period-appropriate styling evoking Victorian/Edwardian era. Mix serif title with old-style body text. Use decorative corner brackets or small ornamental frames. Small caps are welcome. Dates formatted elegantly ("Anno Domini MMXXIV" or "Established in the Year 1847"). Typographic ornaments: ❧ ✦ ◆. Think: a blue plaque on a London townhouse.`,

  [DesignStyle.MemorialSolemn]: `MEMORIAL SOLEMN: Dignified and restrained. Serif title, light-weight body. Generous vertical spacing between groups (2-3x line height). Script accent font for a single personal touch (e.g. a name or "Forever in our hearts" in calligraphy). Use a single thin horizontal rule sparingly. Italic for quotes or epitaphs. Think: a gravestone inscription done with typographic grace.`,

  [DesignStyle.ContemporaryBold]: `CONTEMPORARY BOLD: Dynamic visual tension. Condensed heavy title contrasted with wide light body text. Mix UPPERCASE condensed (Bebas Neue, Oswald) with lowercase expanded sans. Asymmetric visual weight — title can be much bolder and larger than expected. Consider using a contrasting size ratio of 3:1 or more. Think: a gallery exhibition poster.`,

  [DesignStyle.ArtisanCraft]: `ARTISAN CRAFT: Warm, handcrafted feel. Serif or display title paired with a script accent for ONE element (a name, a date, or a short phrase — NOT the whole plaque). Body in clean serif or sans. Small decorative flourishes welcome. Think: a hand-lettered sign for an artisan bakery.`,

  [DesignStyle.Institutional]: `INSTITUTIONAL: Official, authoritative tone. ALL CAPS throughout with varied sizes. Sans-serif fonts only (Montserrat, Oswald, Raleway). Structured grid-like layout. Even spacing. No scripts, no decorative elements. Information hierarchy: Organization → Person/Event → Date → Details. Think: a government building dedication.`,
};

const EXAMPLE_LAYOUTS = `
## EXAMPLE A — Monumental Style (300×200 canvas):
<text y="-15" text-anchor="middle" font-family="Bebas Neue" font-weight="700" font-size="72" letter-spacing="0.2em" fill="currentColor">STERLING</text>
<text y="30" text-anchor="middle" font-family="Raleway" font-weight="300" font-size="14" letter-spacing="0.25em" fill="currentColor">ESTABLISHED 1889</text>

## EXAMPLE B — Classical Formal (300×200 canvas):
<text y="-45" text-anchor="middle" font-family="Playfair Display" font-weight="700" font-size="42" letter-spacing="0.06em" fill="currentColor">THE WELLINGTON</text>
<text y="-18" text-anchor="middle" font-family="Lato" font-weight="300" font-size="12" letter-spacing="0.25em" fill="currentColor">— FINE DINING &amp; ACCOMMODATION —</text>
<text y="18" text-anchor="middle" font-family="Lato" font-weight="400" font-size="16" fill="currentColor">Established 1847</text>
<text y="48" text-anchor="middle" font-family="Playfair Display" font-weight="400" font-size="14" fill="currentColor">Where Tradition Meets Excellence</text>

## EXAMPLE C — Modern Minimal (300×200 canvas):
<text y="-20" text-anchor="middle" font-family="Montserrat" font-weight="600" font-size="38" letter-spacing="0.04em" fill="currentColor">Science Wing</text>
<text y="15" text-anchor="middle" font-family="Raleway" font-weight="300" font-size="16" fill="currentColor">Opened September 2024</text>
<text y="45" text-anchor="middle" font-family="Raleway" font-weight="300" font-size="13" letter-spacing="0.12em" fill="currentColor">GREENFIELD ACADEMY</text>

## EXAMPLE D — Heritage (300×200 canvas):
<text y="-50" text-anchor="middle" font-family="Cinzel" font-weight="400" font-size="14" letter-spacing="0.3em" fill="currentColor">❧</text>
<text y="-20" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="36" letter-spacing="0.12em" fill="currentColor">HARTLEY HOUSE</text>
<text y="10" text-anchor="middle" font-family="EB Garamond" font-weight="400" font-size="16" letter-spacing="0.08em" fill="currentColor">Built in the Year 1756</text>
<text y="35" text-anchor="middle" font-family="EB Garamond" font-weight="400" font-size="15" fill="currentColor">Grade II Listed Building</text>
<text y="60" text-anchor="middle" font-family="Cinzel" font-weight="400" font-size="12" letter-spacing="0.2em" fill="currentColor">ENGLISH HERITAGE</text>

## EXAMPLE E — Artisan with display accent (300×200 canvas):
<text y="-40" text-anchor="middle" font-family="Playfair Display" font-weight="700" font-size="40" fill="currentColor">Rose Garden</text>
<text y="-8" text-anchor="middle" font-family="Lora" font-size="18" fill="currentColor">donated with love</text>
<text y="25" text-anchor="middle" font-family="Lato" font-weight="400" font-size="16" fill="currentColor">by the Harrison Family</text>
<text y="55" text-anchor="middle" font-family="Lato" font-weight="300" font-size="13" letter-spacing="0.1em" fill="currentColor">Spring 2019</text>
`;

// ─── Helper: Pick a font palette ─────────────────────────────────
function pickFontPalette(style: DesignStyle): FontPalette | null {
  if (style === DesignStyle.Auto) return null;
  const palettes = STYLE_FONT_PALETTES[style];
  return palettes[0];
}

// Pick a random archetype for "Auto" mode
function pickRandomArchetype(): Exclude<DesignStyle, DesignStyle.Auto> {
  const styles = Object.values(DesignStyle).filter(s => s !== DesignStyle.Auto) as Exclude<DesignStyle, DesignStyle.Auto>[];
  return styles[Math.floor(Math.random() * styles.length)];
}

function resolveTypographyStyle(style: DesignStyle, context?: InscriptionContext): Exclude<DesignStyle, DesignStyle.Auto> {
  if (style !== DesignStyle.Auto) return style;
  if (context?.purpose === "memorial") return DesignStyle.MemorialSolemn;
  if (context?.purpose === "heritage") return DesignStyle.HeritagePlaque;
  if (context?.purpose === "commemorative") return DesignStyle.Institutional;
  return DesignStyle.ClassicalFormal;
}

const STRUCTURED_TEXT_ROLES = ["title", "subtitle", "body", "accent", "date"] as const;
type StructuredTextRole = typeof STRUCTURED_TEXT_ROLES[number];

interface StructuredTextBlock {
  role: StructuredTextRole;
  text: string;
  emphasis?: "normal" | "strong" | "light" | "script";
  transform?: "preserve" | "uppercase" | "titlecase";
}

interface StructuredTextLayout {
  reasoning: string;
  blocks: StructuredTextBlock[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

interface ComposerGuidanceRules {
  raw: string;
  promptBlock: string;
  strictRules: string;
  reasoningSuffix: string;
  forcedFontFamily?: string;
}

function buildComposerGuidanceRules(rawGuidance?: string): ComposerGuidanceRules {
  const raw = normalizeSpace(rawGuidance || "");
  if (!raw) {
    return {
      raw: "",
      promptBlock: "",
      strictRules: "",
      reasoningSuffix: "",
    };
  }

  const lower = raw.toLowerCase();
  const requestedFont = AVAILABLE_FONTS.find((font) => lower.includes(font.toLowerCase()));
  const wantsSingleFont =
    /\b(single|one|same|uniform|consistent)\s+(font|typeface)\b/.test(lower)
    || /\bno\s+(font\s+)?(mixing|changes|switching)\b/.test(lower);
  const wantsCompact =
    /\b(compact|tight|tighter|dense|snug)\b/.test(lower)
    || /\bno\s+(big|large|huge|massive)?\s*gaps?\b/.test(lower)
    || /\b(no|less|reduced)\s+(empty\s+)?(space|spacing|whitespace)\b/.test(lower);
  const wantsNoLargeGaps =
    wantsCompact || /\b(gaps?|spacing|whitespace)\b/.test(lower) && /\b(no|avoid|without|reduce|less|small)\b/.test(lower);
  const forcedFontFamily = requestedFont || (wantsSingleFont ? (AVAILABLE_FONTS.includes("Lato") ? "Lato" : AVAILABLE_FONTS[0]) : undefined);

  const rules = [
    `USER COMPOSER GUIDANCE: "${raw}"`,
    "Treat the user composer guidance as high-priority layout direction. It is below only exact wording preservation, safety, and containment.",
    "In reasoning, explicitly say how the composer guidance affected the typography.",
  ];
  const strictRules: string[] = [
    `- Composer guidance is active and must visibly affect the generated typography: "${raw}".`,
  ];

  if (forcedFontFamily) {
    rules.push(`Hard font rule: use exactly one font-family for every text and tspan: ${forcedFontFamily}. Do not use accent fonts.`);
    strictRules.push(`- HARD USER FONT RULE: every <text> and <tspan> that declares a font-family must use "${forcedFontFamily}". Prefer putting font-family="${forcedFontFamily}" on every <text>. Do not use a second font.`);
  }
  if (wantsCompact) {
    rules.push("Hard spacing rule: make the composition compact, with no large decorative vertical gaps. Keep related memorial phrases close together.");
    strictRules.push("- HARD USER SPACING RULE: use a compact vertical rhythm. No large blank bands between name, tribute phrase, and dates. Keep baselines evenly grouped with line-height about 1.05-1.18 for related lines.");
    strictRules.push("- For compact/no-gap requests, the wording block should feel like one coherent inscription, not separated islands. Use size hierarchy without leaving big empty space.");
  } else if (wantsNoLargeGaps) {
    rules.push("Spacing rule: avoid visibly large gaps unless needed for readability.");
    strictRules.push("- USER SPACING RULE: avoid visibly large vertical gaps; use balanced, readable spacing.");
  }

  return {
    raw,
    promptBlock: rules.join("\n"),
    strictRules: strictRules.join("\n"),
    reasoningSuffix: `Composer guidance applied: ${raw}`,
    forcedFontFamily,
  };
}

function applyComposerGuidancePostProcess(svgContent: string, rules: ComposerGuidanceRules): string {
  if (!rules.forcedFontFamily || !svgContent.trim()) return svgContent;

  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgContent;

  Array.from(doc.querySelectorAll("text,tspan")).forEach((node) => {
    if (node instanceof Element && (node.tagName.toLowerCase() === "text" || node.hasAttribute("font-family"))) {
      node.setAttribute("font-family", rules.forcedFontFamily!);
    }
  });

  return Array.from(doc.documentElement.children)
    .filter((node) => node.tagName.toLowerCase() === "text")
    .map((node) => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ""))
    .join("\n") || svgContent;
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/\b[\p{L}\p{N}]/gu, (char) => char.toUpperCase());
}

function wrapLine(line: string, maxChars: number) {
  const words = normalizeSpace(line).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  if (lines.length > 1) {
    const lastWords = lines[lines.length - 1].split(" ");
    const previousWords = lines[lines.length - 2].split(" ");
    if (lastWords.length === 1 && previousWords.length > 2) {
      lastWords.unshift(previousWords.pop()!);
      lines[lines.length - 2] = previousWords.join(" ");
      lines[lines.length - 1] = lastWords.join(" ");
    }
  }
  return lines.length ? lines : [line.trim()];
}

function compactBlocksForSvgLimit(blocks: StructuredTextBlock[], maxBlocks = 12): StructuredTextBlock[] {
  if (blocks.length <= maxBlocks) return blocks;
  const compacted = [...blocks];

  while (compacted.length > maxBlocks) {
    let mergeIndex = compacted.findIndex((block, index) =>
      index > 0 && block.role === "body" && compacted[index - 1].role === "body"
    );
    if (mergeIndex < 1) {
      mergeIndex = compacted.findIndex((block, index) =>
        index > 0 && block.role === "body" && !["title", "date"].includes(compacted[index - 1].role)
      );
    }
    if (mergeIndex < 1) mergeIndex = compacted.length - 1;

    const previous = compacted[mergeIndex - 1];
    const current = compacted[mergeIndex];
    compacted.splice(mergeIndex - 1, 2, {
      role: previous.role === "title" || current.role === "title" ? "body" : previous.role,
      text: normalizeSpace(`${previous.text} ${current.text}`),
      emphasis: previous.emphasis === "strong" && current.emphasis === "strong" ? "strong" : "normal",
      transform: "preserve",
    });
  }

  return compacted;
}

function normalizeStructuredLayout(raw: any, fallbackText: string): StructuredTextLayout {
  const sourceBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  const blocks = sourceBlocks
    .map((block: any): StructuredTextBlock | null => {
      const role = STRUCTURED_TEXT_ROLES.includes(block?.role) ? block.role : "body";
      const text = normalizeSpace(String(block?.text ?? ""));
      if (!text) return null;
      const emphasis = ["normal", "strong", "light", "script"].includes(block?.emphasis) ? block.emphasis : "normal";
      const transform = ["preserve", "uppercase", "titlecase"].includes(block?.transform) ? block.transform : "preserve";
      return { role, text, emphasis, transform };
    })
    .filter(Boolean) as StructuredTextBlock[];

  if (!blocks.length) {
    const fallbackLines = fallbackText.split(/\n+/).map(normalizeSpace).filter(Boolean).slice(0, 6);
    blocks.push(...fallbackLines.map((text, index) => ({
      role: index === 0 ? "title" as const : "body" as const,
      text,
      emphasis: index === 0 ? "strong" as const : "normal" as const,
      transform: "preserve" as const,
    })));
  }

  return {
    reasoning: normalizeSpace(String(raw?.reasoning ?? "Created a structured inscription layout and rendered it locally.")),
    blocks: compactBlocksForSvgLimit(blocks),
  };
}

function fallbackStructuredLayout(promptText: string): StructuredTextLayout {
  return normalizeStructuredLayout({ blocks: [] }, promptText);
}

function inferLocalStructuredLayout(promptText: string): StructuredTextLayout {
  const normalized = normalizeSpace(promptText);
  const sourceLines = promptText.split(/\n+/).map(normalizeSpace).filter(Boolean);

  if (!normalized) return fallbackStructuredLayout(promptText);

  const blocks: StructuredTextBlock[] = [];
  const addBlock = (role: StructuredTextRole, text: string, emphasis: StructuredTextBlock["emphasis"] = "normal") => {
    const cleanText = normalizeSpace(text);
    if (cleanText) blocks.push({ role, text: cleanText, emphasis, transform: "preserve" });
  };

  const memorialMatch = normalized.match(/^(in\s+(?:loving\s+)?memory\s+of)\s+(.+)$/i);
  if (memorialMatch && memorialMatch[2]) {
    const afterPrefix = normalizeSpace(memorialMatch[2]);
    const words = afterPrefix.split(" ");
    const nameStopWords = new Set(["our", "my", "the", "a", "an", "best", "little", "beloved", "forever", "always", "much", "loved", "loving"]);
    let nameWordCount = 0;
    for (const word of words.slice(0, 4)) {
      const plain = word.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
      if (nameWordCount > 0 && nameStopWords.has(plain)) break;
      if (nameWordCount > 0 && /^[a-z]/.test(word)) break;
      nameWordCount += 1;
      if (/[.,;:]$/.test(word)) break;
    }
    nameWordCount = clamp(nameWordCount, 1, Math.min(3, words.length));
    addBlock("subtitle", memorialMatch[1], "light");
    addBlock("title", words.slice(0, nameWordCount).join(" "), "strong");
    addBlock("body", words.slice(nameWordCount).join(" "), "normal");
  } else if (sourceLines.length > 1) {
    const compactLines: string[] = [];
    sourceLines.forEach((line) => {
      const previous = compactLines[compactLines.length - 1];
      const isStandaloneLine = line.length <= 42
        || /\b\d{4}\b|born|died|sunrise|sunset|memory|remember|beloved|forever|heart/i.test(line);
      if (compactLines.length >= 10 && previous && !isStandaloneLine) {
        compactLines[compactLines.length - 1] = `${previous} ${line}`;
      } else {
        compactLines.push(line);
      }
    });
    compactLines.forEach((line, index) => {
      const lower = line.toLowerCase();
      const role: StructuredTextRole = index === 0 && line.length <= 34
        ? "title"
        : /memory|remember|beloved|forever|heart/.test(lower) && line.length <= 42
          ? "accent"
          : /\b\d{4}\b|born|died|sunrise|sunset/.test(lower)
            ? "date"
            : "body";
      addBlock(role, line, index === 0 ? "strong" : role === "accent" ? "script" : "normal");
    });
  } else {
    const sentenceParts = normalized
      .split(/(?<=[.!?])\s+/)
      .map(normalizeSpace)
      .filter(Boolean);
    if (sentenceParts.length > 1) {
      sentenceParts.forEach((part, index) => addBlock(index === 0 && part.length <= 34 ? "title" : "body", part, index === 0 ? "strong" : "normal"));
    } else {
      addBlock(normalized.length <= 34 ? "title" : "body", normalized, normalized.length <= 34 ? "strong" : "normal");
    }
  }

  return {
    reasoning: "Fast local typesetter used the exact available inscription box, preserved the wording, and balanced the text without a model round-trip.",
    blocks: blocks.length ? compactBlocksForSvgLimit(blocks) : fallbackStructuredLayout(promptText).blocks,
  };
}

function preserveExactStructuredWording(layout: StructuredTextLayout, inscription: string): StructuredTextLayout {
  const plannedText = layout.blocks.map((block) => block.text).join(" ");
  const changesCasing = layout.blocks.some((block) => block.transform && block.transform !== "preserve");
  if (changesCasing || normalizeSpace(plannedText) !== normalizeSpace(inscription)) {
    throw new Error("Structured layout changed, omitted, reordered, or invented inscription wording");
  }
  return layout;
}

export interface InscriptionBox {
  width: number;
  height: number;
}

export interface InscriptionContext {
  purpose: "memorial" | "heritage" | "commercial" | "commemorative";
  portraitRelationship: string;
  layoutGuidance?: string;
}

interface AuthoredTypographySvg {
  reasoning: string;
  svgContent: string;
}

const ROOT_ATTRIBUTES = new Set(["xmlns", "viewbox", "width", "height"]);
const TYPOGRAPHY_ATTRIBUTES = new Set([
  "x", "y", "dx", "dy", "text-anchor", "font-family", "font-size",
  "font-weight", "font-style", "letter-spacing", "fill",
]);
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

function parseFiniteNumber(value: string, label: string): number {
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    throw new Error(`${label} must be a plain finite number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite`);
  return parsed;
}

function parseLetterSpacing(value: string | null): number {
  if (!value) return 0;
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(em)?$/);
  if (!match) throw new Error("letter-spacing must be a plain number or em value");
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < -0.05 || parsed > 0.4) {
    throw new Error("letter-spacing is outside the safe range");
  }
  return parsed;
}

function estimateTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  const glyphWidth = Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.3;
    if (/[ilI1'.,:;!|]/.test(char)) return sum + 0.3;
    if (/[mwMW@%&]/.test(char)) return sum + 0.88;
    if (/[A-Z0-9]/.test(char)) return sum + 0.66;
    return sum + 0.54;
  }, 0);
  return fontSize * (glyphWidth + Math.max(0, text.length - 1) * letterSpacing);
}

function validateTypographyAttributes(element: Element) {
  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (!TYPOGRAPHY_ATTRIBUTES.has(name)) throw new Error(`Unsafe SVG attribute: ${name}`);
  });

  const fontFamily = element.getAttribute("font-family");
  if (fontFamily && !AVAILABLE_FONTS.includes(fontFamily)) throw new Error(`Unsupported font: ${fontFamily}`);
  if (fontFamily && SCRIPT_FONT_FAMILIES.has(fontFamily)) {
    throw new Error("Script fonts are disabled for generated production typography because they do not export reliably as vector outlines");
  }
  if (fontFamily && SCRIPT_FONT_FAMILIES.has(fontFamily) && element.hasAttribute("letter-spacing")) {
    throw new Error("Script fonts must not use letter-spacing; it breaks contextual cursive export");
  }
  const textAnchor = element.getAttribute("text-anchor");
  if (textAnchor && !["start", "middle", "end"].includes(textAnchor)) throw new Error("Unsupported text-anchor");

  const fill = element.getAttribute("fill");
  if (fill && fill !== "currentColor") throw new Error("Only currentColor fills are allowed");

  const fontStyle = element.getAttribute("font-style");
  if (fontStyle && fontStyle !== "normal") {
    throw new Error("Italic SVG text is disabled because it does not export reliably as vector outlines");
  }

  const fontWeight = element.getAttribute("font-weight");
  if (fontWeight) {
    if (!["normal", "bold"].includes(fontWeight)) {
      const weight = parseFiniteNumber(fontWeight, "font-weight");
      if (weight < 300 || weight > 900 || weight % 100 !== 0) throw new Error("font-weight is outside the safe range");
    }
  }

  const fontSize = element.getAttribute("font-size");
  if (fontSize) {
    const size = parseFiniteNumber(fontSize, "font-size");
    if (size < 5) throw new Error("font-size is below the readable minimum");
  }

  ["x", "y", "dx", "dy"].forEach((name) => {
    const value = element.getAttribute(name);
    if (value) parseFiniteNumber(value, name);
  });
  parseLetterSpacing(element.getAttribute("letter-spacing"));
}

function validateTextContainment(text: Element, box: InscriptionBox) {
  const fontSize = parseFiniteNumber(text.getAttribute("font-size") || "", "text font-size");
  const letterSpacing = parseLetterSpacing(text.getAttribute("letter-spacing"));
  const defaultX = parseFiniteNumber(text.getAttribute("x") || "0", "text x");
  let baseline = parseFiniteNumber(text.getAttribute("y") || "", "text y");
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const runs = Array.from(text.children).length ? Array.from(text.children) : [text];

  runs.forEach((run, index) => {
    const runFontSize = parseFiniteNumber(run.getAttribute("font-size") || String(fontSize), "run font-size");
    if (index > 0 || run !== text) baseline += parseFiniteNumber(run.getAttribute("dy") || "0", "run dy");
    const x = parseFiniteNumber(run.getAttribute("x") || String(defaultX), "run x");
    const runFontFamily = run.getAttribute("font-family") || text.getAttribute("font-family");
    if (runFontFamily && SCRIPT_FONT_FAMILIES.has(runFontFamily)) {
      throw new Error("Script fonts are disabled for generated production typography because they do not export reliably as vector outlines");
    }
    if (runFontFamily && SCRIPT_FONT_FAMILIES.has(runFontFamily) && (run.hasAttribute("letter-spacing") || text.hasAttribute("letter-spacing"))) {
      throw new Error("Script fonts must not use letter-spacing; it breaks contextual cursive export");
    }
    const runFontStyle = run.getAttribute("font-style") || text.getAttribute("font-style");
    if (runFontStyle && runFontStyle !== "normal") {
      throw new Error("Italic SVG text is disabled because it does not export reliably as vector outlines");
    }
    const spacing = parseLetterSpacing(run.getAttribute("letter-spacing") || text.getAttribute("letter-spacing"));
    const textContent = run.textContent || "";
    const estimatedWidth = estimateTextWidth(textContent, runFontSize, Math.max(letterSpacing, spacing));
    const anchor = run.getAttribute("text-anchor") || text.getAttribute("text-anchor") || "middle";
    const left = anchor === "start" ? x : anchor === "end" ? x - estimatedWidth : x - estimatedWidth / 2;
    const right = anchor === "start" ? x + estimatedWidth : anchor === "end" ? x : x + estimatedWidth / 2;
    if (estimatedWidth > box.width * 1.08 || left < -halfWidth * 1.08 || right > halfWidth * 1.08) {
      throw new Error("Authored SVG has obvious horizontal text overflow");
    }
    if (baseline - runFontSize < -halfHeight * 1.08 || baseline + runFontSize * 0.35 > halfHeight * 1.08) {
      throw new Error("Authored SVG has obvious vertical text overflow");
    }
  });
}

function getTypographyLines(text: Element) {
  const tspans = Array.from(text.children);
  if (tspans.length) return tspans.map((tspan) => normalizeSpace(tspan.textContent || "")).filter(Boolean);
  const line = normalizeSpace(text.textContent || "");
  return line ? [line] : [];
}

function validateTypographyComposition(texts: Element[], inscription: string, box: InscriptionBox) {
  const typographyNodes = texts.flatMap((text) => [text, ...Array.from(text.querySelectorAll("tspan"))]);
  const fontFamilies = new Set(typographyNodes.map((node) => node.getAttribute("font-family")).filter(Boolean));
  const scriptFamilies = Array.from(fontFamilies).filter((font) => SCRIPT_FONT_FAMILIES.has(font));
  if (fontFamilies.size > 2 && !(fontFamilies.size === 3 && scriptFamilies.length === 1)) {
    throw new Error("Authored SVG uses too many font families for a restrained plaque layout");
  }

  typographyNodes.forEach((node) => {
    const text = normalizeSpace(node.textContent || "");
    if (!text || !/[a-z]/.test(text)) return;
    const spacing = parseLetterSpacing(
      node.getAttribute("letter-spacing")
      || node.parentElement?.getAttribute("letter-spacing")
    );
    const wordCount = text.split(" ").filter(Boolean).length;
    if (wordCount >= 2 && spacing > 0.08) {
      throw new Error("Sentence-style inscription copy uses excessive letter spacing and would read as broken words");
    }
    if (wordCount >= 4 && spacing > 0.04) {
      throw new Error("Multi-word tribute copy must use natural letter spacing, not tracked display spacing");
    }
  });

  const sourceSingleWordLines = new Set(
    inscription.split(/\n+/).map(normalizeSpace).filter((line) => line.split(" ").length === 1)
  );
  const lines = texts.flatMap(getTypographyLines);
  lines.forEach((line) => {
    const words = line.split(" ");
    if (words.length !== 1 || sourceSingleWordLines.has(line)) return;
    if (line.length <= 4) {
      throw new Error("Authored SVG contains a weak short orphan line");
    }
  });

  texts.forEach((text) => {
    const linesInBlock = getTypographyLines(text);
    if (linesInBlock.length < 2) return;
    const finalLine = linesInBlock[linesInBlock.length - 1];
    const previousLine = linesInBlock[linesInBlock.length - 2];
    if (finalLine.split(" ").length === 1 && previousLine.split(" ").length > 2) {
      throw new Error("Authored SVG contains an avoidable orphaned final word");
    }
  });

  if (normalizeSpace(inscription).length > 180) {
    const proseLines = texts
      .flatMap((text) => {
        const inheritedSize = parseFiniteNumber(text.getAttribute("font-size") || "", "text font-size");
        return (Array.from(text.children).length ? Array.from(text.children) : [text])
          .map((line) => ({
            text: normalizeSpace(line.textContent || ""),
            size: parseFiniteNumber(line.getAttribute("font-size") || String(inheritedSize), "line font-size"),
          }));
      })
      .filter((line) => line.text.split(" ").length >= 4);
    const readableFloor = clamp(Math.min(box.width, box.height) * 0.044, 8, 10);
    if (proseLines.some((line) => line.size < readableFloor)) {
      throw new Error(`Dense prose is too small; use at least ${readableFloor.toFixed(1)} for body copy and rebalance the composition`);
    }
  }
}

export function validateAuthoredTypographySvg(rawSvg: string, inscription: string, box: InscriptionBox): string {
  if (!rawSvg || rawSvg.length > 24000) throw new Error("Authored SVG is empty or too large");
  if (/<!doctype|<!entity/i.test(rawSvg)) throw new Error("DTD and entities are not allowed");

  const doc = new DOMParser().parseFromString(rawSvg.trim(), "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("Authored SVG is not parseable XML");
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg") throw new Error("Authored response must have an svg root");
  if (Array.from(root.childNodes).some((child) =>
    child.nodeType !== Node.ELEMENT_NODE && (child.nodeType !== Node.TEXT_NODE || child.textContent?.trim())
  )) {
    throw new Error("Only typography elements and whitespace are allowed inside the svg root");
  }

  Array.from(root.attributes).forEach((attribute) => {
    if (!ROOT_ATTRIBUTES.has(attribute.name.toLowerCase())) throw new Error(`Unsafe svg root attribute: ${attribute.name}`);
  });

  const rootWidth = parseFiniteNumber(root.getAttribute("width") || "", "svg width");
  const rootHeight = parseFiniteNumber(root.getAttribute("height") || "", "svg height");
  if (Math.abs(rootWidth - box.width) > 0.05 || Math.abs(rootHeight - box.height) > 0.05) {
    throw new Error("Authored SVG dimensions do not match the inscription box");
  }

  const viewBox = (root.getAttribute("viewBox") || "").trim().split(/\s+/).map((part) => parseFiniteNumber(part, "viewBox"));
  if (viewBox.length !== 4
    || Math.abs(viewBox[0] + box.width / 2) > 0.05
    || Math.abs(viewBox[1] + box.height / 2) > 0.05
    || Math.abs(viewBox[2] - box.width) > 0.05
    || Math.abs(viewBox[3] - box.height) > 0.05) {
    throw new Error("Authored SVG viewBox must match the centered inscription box");
  }

  const texts = Array.from(root.children);
  if (!texts.length || texts.length > 12) throw new Error("Authored SVG must contain 1-12 text elements");
  texts.forEach((text) => {
    if (text.tagName.toLowerCase() !== "text") throw new Error(`Unsafe SVG element: ${text.tagName}`);
    validateTypographyAttributes(text);
    if (!text.getAttribute("font-family")
      || !text.getAttribute("font-size")
      || !text.getAttribute("y")
      || text.getAttribute("fill") !== "currentColor"
      || !text.getAttribute("text-anchor")) {
      throw new Error("Each text element needs a safe font, size, y, text anchor and currentColor fill");
    }
    Array.from(text.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE || (child as Element).tagName.toLowerCase() !== "tspan") {
        throw new Error("Only text and tspan typography elements are allowed");
      }
      const tspan = child as Element;
      validateTypographyAttributes(tspan);
      if (Array.from(tspan.childNodes).some((nested) => nested.nodeType !== Node.TEXT_NODE)) {
        throw new Error("Nested SVG markup is not allowed");
      }
    });
    if (text.querySelector("tspan")) {
      const hasDirectText = Array.from(text.childNodes).some((child) =>
        child.nodeType === Node.TEXT_NODE && normalizeSpace(child.textContent || "")
      );
      if (hasDirectText) {
        throw new Error("Text elements with tspans must put every visible line inside a tspan");
      }
    }
    validateTextContainment(text, box);
  });

  const renderedText = texts.map((text) =>
    Array.from(text.childNodes).map((child) => child.textContent || "").join(" ")
  ).join(" ");
  if (normalizeSpace(renderedText) !== normalizeSpace(inscription)) {
    throw new Error("Authored SVG changed, omitted, reordered, or invented inscription wording");
  }
  validateTypographyComposition(texts, inscription, box);

  return texts
    .map((node) => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ""))
    .join("\n");
}

function wrapTypographySvg(svgContent: string, box: InscriptionBox) {
  const width = Number(box.width.toFixed(2));
  const height = Number(box.height.toFixed(2));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}">${svgContent}</svg>`;
}

function proveRenderedTypographySvg(svgContent: string, inscription: string, box: InscriptionBox) {
  return validateAuthoredTypographySvg(wrapTypographySvg(svgContent, box), inscription, box);
}

function extractTypographyFromAuthoredSvg(rawSvg: string, box: InscriptionBox): string {
  if (!rawSvg) return "";
  const doc = new DOMParser().parseFromString(rawSvg.trim(), "image/svg+xml");
  if (doc.querySelector("parsererror")) return "";
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg") return "";
  return Array.from(root.children)
    .filter((node) => node.tagName.toLowerCase() === "text")
    .map((node) => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ""))
    .join("\n") || fallbackRenderedTextOnlySvg("", box);
}

const DECORATIVE_SYMBOLS = new Set(Array.from("□■◇◆◊♦✦✧✶✷✹✺✻✼✽✾✿❖❧☙•·▪▫◾◽○●◦"));

function isDecorativeSymbolText(text: string) {
  const chars = Array.from(text).filter((char) => !/\s/.test(char));
  return chars.length > 0 && chars.every((char) => DECORATIVE_SYMBOLS.has(char));
}

function symbolLetterSpacingPx(value: string | null, fontSize: number) {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return trimmed.endsWith("em") ? parsed * fontSize : parsed;
}

function symbolPathD(char: string, cx: number, cy: number, radius: number) {
  const r = Math.max(1.2, radius);
  if ("•·○●◦".includes(char)) {
    const k = r * 0.55228475;
    return [
      `M ${cx.toFixed(2)} ${(cy - r).toFixed(2)}`,
      `C ${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)}`,
      `C ${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)}`,
      `C ${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)}`,
      `C ${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)}`,
      "Z",
    ].join(" ");
  }
  if ("✦✧✶✷✹✺✻✼✽✾✿❖❧☙".includes(char)) {
    return [
      `M ${cx.toFixed(2)} ${(cy - r * 1.28).toFixed(2)}`,
      `L ${(cx + r * 0.34).toFixed(2)} ${(cy - r * 0.34).toFixed(2)}`,
      `L ${(cx + r * 1.28).toFixed(2)} ${cy.toFixed(2)}`,
      `L ${(cx + r * 0.34).toFixed(2)} ${(cy + r * 0.34).toFixed(2)}`,
      `L ${cx.toFixed(2)} ${(cy + r * 1.28).toFixed(2)}`,
      `L ${(cx - r * 0.34).toFixed(2)} ${(cy + r * 0.34).toFixed(2)}`,
      `L ${(cx - r * 1.28).toFixed(2)} ${cy.toFixed(2)}`,
      `L ${(cx - r * 0.34).toFixed(2)} ${(cy - r * 0.34).toFixed(2)}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${cx.toFixed(2)} ${(cy - r).toFixed(2)}`,
    `L ${(cx + r).toFixed(2)} ${cy.toFixed(2)}`,
    `L ${cx.toFixed(2)} ${(cy + r).toFixed(2)}`,
    `L ${(cx - r).toFixed(2)} ${cy.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function convertStandaloneSymbolTextToPaths(svgContent: string): string {
  if (!svgContent || typeof DOMParser === "undefined") return svgContent;
  try {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svgContent;

    Array.from(doc.querySelectorAll("text")).forEach((text) => {
      const content = text.textContent || "";
      if (!isDecorativeSymbolText(content)) return;

      const symbols = Array.from(content).filter((char) => DECORATIVE_SYMBOLS.has(char));
      if (!symbols.length) return;

      const fontSize = Math.max(5, Number.parseFloat(text.getAttribute("font-size") || "10") || 10);
      const spacing = symbolLetterSpacingPx(text.getAttribute("letter-spacing"), fontSize);
      const step = Math.max(fontSize * 0.72, fontSize * 0.88 + spacing);
      const anchor = text.getAttribute("text-anchor") || "middle";
      const x = Number.parseFloat(text.getAttribute("x") || "0") || 0;
      const baseline = Number.parseFloat(text.getAttribute("y") || "0") || 0;
      const centerY = baseline - fontSize * 0.32;
      const totalWidth = step * Math.max(0, symbols.length - 1);
      const startX = anchor === "start" ? x : anchor === "end" ? x - totalWidth : x - totalWidth / 2;
      const radius = fontSize * 0.28;
      const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("fill", "currentColor");
      group.setAttribute("stroke", "none");
      group.setAttribute("data-generated-symbols", "true");

      symbols.forEach((symbol, index) => {
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", symbolPathD(symbol, startX + index * step, centerY, radius));
        path.setAttribute("fill", "currentColor");
        group.appendChild(path);
      });

      text.parentNode?.replaceChild(group, text);
    });

    return Array.from(doc.documentElement.children)
      .map((node) => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ""))
      .join("\n");
  } catch (error) {
    console.warn("Decorative symbol conversion failed.", error);
    return svgContent;
  }
}

function splitShortLeadInNameLines(svgContent: string): string {
  if (!svgContent || typeof DOMParser === "undefined") return svgContent;
  try {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svgContent;

    const splitLine = (line: Element, sourceText: string, inheritedX: string | null, inheritedFontSize: string | null) => {
      const match = normalizeSpace(sourceText).match(/^(by)\s+(.{2,})$/i);
      if (!match) return false;

      const name = normalizeSpace(match[2]);
      if (!name || name.split(" ").length > 5) return false;

      const fontSize = Math.max(5, Number.parseFloat(line.getAttribute("font-size") || inheritedFontSize || "10") || 10);
      const x = line.getAttribute("x") || inheritedX || "0";
      const dy = (fontSize * 1.12).toFixed(2);
      const parent = line.parentElement;
      if (!parent) return false;

      const lead = doc.createElementNS("http://www.w3.org/2000/svg", "tspan");
      lead.setAttribute("x", x);
      lead.setAttribute("dy", line.tagName.toLowerCase() === "tspan" ? (line.getAttribute("dy") || "0") : "0");
      lead.textContent = `${match[1]} `;

      const nameLine = doc.createElementNS("http://www.w3.org/2000/svg", "tspan");
      nameLine.setAttribute("x", x);
      nameLine.setAttribute("dy", dy);
      nameLine.textContent = name;

      if (line.tagName.toLowerCase() === "tspan") {
        parent.replaceChild(nameLine, line);
        parent.insertBefore(lead, nameLine);
      } else {
        line.textContent = "";
        line.appendChild(lead);
        line.appendChild(nameLine);
      }
      return true;
    };

    Array.from(doc.querySelectorAll("text")).forEach((text) => {
      const x = text.getAttribute("x");
      const fontSize = text.getAttribute("font-size");
      const tspans = Array.from(text.children).filter((child) => child.tagName.toLowerCase() === "tspan");
      if (tspans.length) {
        tspans.forEach((tspan) => splitLine(tspan, tspan.textContent || "", x, fontSize));
      } else {
        splitLine(text, text.textContent || "", x, fontSize);
      }
    });

    return Array.from(doc.documentElement.children)
      .map((node) => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ""))
      .join("\n");
  } catch (error) {
    console.warn("Lead-in/name line split failed.", error);
    return svgContent;
  }
}

function fallbackRenderedTextOnlySvg(inscription: string, box: InscriptionBox): string {
  return renderStructuredLayoutToSvg(fallbackStructuredLayout(inscription), box.width, box.height, Shape.Rect, DesignStyle.ClassicalFormal);
}

async function generateAuthoredTypographySvg(
  inscription: string,
  plaqueWidth: number,
  plaqueHeight: number,
  shape: Shape,
  designStyle: DesignStyle,
  box: InscriptionBox,
  context?: InscriptionContext
): Promise<AuthoredTypographySvg> {
  const ai = getAIClient();
  const styleDescription = ARCHETYPE_DESCRIPTIONS[designStyle === DesignStyle.Auto ? pickRandomArchetype() : designStyle];
  const width = Number(box.width.toFixed(2));
  const height = Number(box.height.toFixed(2));
  const denseCopy = normalizeSpace(inscription).length > 180;
  const denseReadableFloor = clamp(Math.min(width, height) * 0.044, 8, 10);
  const guidanceRules = buildComposerGuidanceRules(context?.layoutGuidance);

  const prompt = `
Act as an expert plaque typographer and SVG front-end developer. Code one polished, production-suitable SVG typography layout. Solve the layout directly rather than describing it.

PHYSICAL PLAQUE: ${plaqueWidth}mm wide x ${plaqueHeight}mm high, shape ${shape}.
ACTUAL AVAILABLE INSCRIPTION BOX: ${width} units wide x ${height} units high, aspect ratio ${(width / height).toFixed(4)}.
The box is already reduced for margins and any portrait artwork. Design for this exact box.
PLAQUE PURPOSE: ${context?.purpose || "commemorative"}.
PORTRAIT RELATIONSHIP: ${context?.portraitRelationship || "No portrait artwork is present. The inscription is the primary composition."}
${guidanceRules.promptBlock}
STYLE INTENT: ${styleDescription}

Return JSON only with "reasoning" and "svgContent". svgContent must be a complete parseable SVG:
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}">...</svg>

TEXT HANDLING:
- The user composer guidance is layout/style direction only. It is not plaque wording. Never add it to the inscription text.
- Correct only clear spelling mistakes or obvious typos when the intended word is unambiguous, for example "freind" to "friend". Do not rewrite style, meaning, names, dates, grammar, sentiment, or wording just because it could be phrased better.
- If a possible issue is ambiguous, leave it unchanged and mention it briefly in reasoning as "Possible typo left unchanged: ...".
- If you correct a spelling mistake, list it briefly in reasoning as "Spelling corrected: old -> new".
- Preserve user line breaks as layout intent: each input line should become a visual line or block lower down on the plaque. Blank input lines mean deliberate extra vertical spacing.
- Do not invent ornaments or extra words.

STRICT SVG RULES:
- Use 1-12 <text> elements and optional direct-child <tspan> elements only. No other SVG elements.
- If a <text> element uses any <tspan>, every visible line in that <text> must be inside a <tspan>. Do not mix direct text content with tspan children.
- Do not use scripts, styles, classes, ids, transforms, event attributes, hrefs, URLs, external references, paths, shapes, groups or decorative elements.
- Use only these attributes: x, y, dx, dy, text-anchor, font-family, font-size, font-weight, letter-spacing, fill. Do not use font-style.
- Use fill="currentColor". Use plain finite numeric coordinates and font sizes.
- Center headings and dates with x="0" text-anchor="middle". For dense prose, prefer a deliberate editorial paragraph block using text-anchor="start" and a negative x coordinate near the left edge of the box. Keep every line inside the measured width.
- Every font-size must be 5 or larger. There is deliberately NO upper font-size limit: use large headings when the copy and containment allow it. Never use font-size below 5 to force dense copy to fit.
- font-weight may be normal, bold, or a numeric hundred from 300 to 900.
- letter-spacing must be a plain number or em value between -0.05 and 0.4. Never exceed 0.4em.
- Use letter-spacing only for short uppercase display headings or dates. Never track normal sentence-case tribute copy: multi-word lowercase lines must use natural spacing, no more than 0.04em.
- Never use script/cursive fonts in generated production typography: Great Vibes, Pinyon Script, Alex Brush, Allura, Dancing Script, Pacifico, Satisfy, or Caveat.
- Never use font-style="italic" on any generated text; italic outlines do not export reliably. Use normal-style serif, sans, or display families for emphasis instead.
- Choose fonts only from: ${AVAILABLE_FONTS.join(", ")}.
- Keep every line inside the viewBox. Make hierarchy, spacing and line breaks do the design work.
- Do not change casing for style. If the inscription casing is imperfect, preserve it.
- Use a restrained font system: one primary family plus at most one accent family. Do not give each phrase a different font.
- Treat the inscription as a composed block, not a stack of unrelated lines. Keep short phrases together whenever they fit.
- If a visual line starts with a short attribution such as "by" followed by a name, put "by" on its own small line and the name on the next line. Do not put "by" on the same visual line as the name.
- Never leave short words such as "of", "guy", "day", "and", or "the" stranded on their own line. Avoid single-word final lines by balancing the wrap.
- Do not use script or cursive fonts. A memorial plaque should feel calm, deliberate, and legible with upright serif/sans/display typography.
- Make useful use of the available box. Prefer a compact, confident composition over excessive gaps and tiny supporting lines.
- For short memorial wording like "In loving memory of [Name] ... forever in our hearts ... 2014-2026": use a calm compact hierarchy. The name may be the large focal point in an upright serif/display family; keep ordinary supporting copy upright and readable; reserve one normal-style serif/display accent for the emotional phrase only; classify year ranges as dates; avoid a large empty gap between the name and supporting line.
- For dense copy, use fewer text elements with direct-child tspans, compact dy spacing, moderate hierarchy, and the full available width. Do not solve density with unreadably small type.
${denseCopy ? `- THIS IS DENSE COPY: every prose line with four or more words MUST use font-size ${denseReadableFloor.toFixed(1)} or larger. This is a hard validation rule. Headings have no upper size limit: make them as strong as the remaining space permits after the readable prose is solved.` : ""}
${guidanceRules.strictRules}

COMPOSITION METHOD:
1. Read the wording and identify title, date, and prose groups.
2. Apply USER COMPOSER GUIDANCE before style defaults. If guidance conflicts with the archetype style, the user guidance wins.
3. Allocate the full box deliberately. Use confident headings and readable prose, not a narrow miniature column.
4. For multi-line prose, use one <text> block with direct-child <tspan x="..."> lines where practical. Keep the same measured left edge across prose lines when using text-anchor="start".
5. Check the longest line against the available width and check the first and last baselines against the available height.
6. Return the final SVG only after balancing the vertical rhythm.

INSCRIPTION, between delimiters:
---BEGIN INSCRIPTION---
${inscription}
---END INSCRIPTION---
`;

  const response = await retryWrapper(async () => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoning: { type: Type.STRING },
          svgContent: { type: Type.STRING },
        },
        required: ["reasoning", "svgContent"],
      },
    },
  }));

  if (!response.text) throw new Error("No authored typography SVG returned from Gemini");
  const parsed = JSON.parse(response.text);
  const extractedSvg = extractTypographyFromAuthoredSvg(String(parsed.svgContent || ""), box);
  const guidedSvg = splitShortLeadInNameLines(
    convertStandaloneSymbolTextToPaths(applyComposerGuidancePostProcess(extractedSvg, guidanceRules))
  );
  return {
    reasoning: normalizeSpace([
      String(parsed.reasoning || "Model-authored SVG typography layout accepted without proof gates."),
      guidanceRules.reasoningSuffix,
    ].filter(Boolean).join(" ")),
    svgContent: guidedSvg,
  };
}

function renderStructuredLayoutToSvg(layout: StructuredTextLayout, width: number, height: number, shape: Shape, style: DesignStyle): string {
  const resolvedStyle = style === DesignStyle.Auto ? DesignStyle.MemorialSolemn : style;
  const palette = pickFontPalette(resolvedStyle) || { title: "Cinzel", body: "Lato", accent: "Playfair Display" };
  const minSide = Math.min(width, height);
  const margin = clamp(minSide * (shape === Shape.Rect ? 0.025 : 0.055), 2, 10);
  const safeW = Math.max(40, width - margin * 2);
  const safeH = Math.max(34, height - margin * 2);
  const totalCharacters = layout.blocks.reduce((sum, block) => sum + normalizeSpace(block.text).length, 0);
  const longForm = totalCharacters > 180 || layout.blocks.length > 6;

  const prepared = layout.blocks.map((block, index) => {
    const role = block.role || (index === 0 ? "title" : "body");
    const rawText = block.transform === "uppercase"
      ? block.text.toUpperCase()
      : block.transform === "titlecase"
        ? toTitleCase(block.text)
        : block.text;
    const maxChars = role === "title"
      ? longForm
        ? clamp(Math.round(safeW / 8), 18, 34)
        : clamp(Math.round(safeW / Math.max(8, minSide * 0.12)), 10, 24)
      : clamp(Math.round(safeW / Math.max(3.4, minSide * (longForm ? 0.020 : 0.045))), longForm ? 40 : 22, longForm ? 82 : 48);
    const lines = rawText.split(/\n+/).flatMap(line => wrapLine(line, maxChars));
    const roleSize = role === "title"
      ? minSide * (style === DesignStyle.Monumental ? (longForm ? 0.17 : 0.32) : (longForm ? 0.115 : 0.23))
      : role === "subtitle"
        ? minSide * (longForm ? 0.075 : 0.095)
        : role === "accent"
          ? minSide * (longForm ? 0.095 : 0.13)
          : minSide * (longForm ? 0.068 : 0.078);
    const size = clamp(roleSize, longForm ? 8 : 7.5, minSide * 0.34);
    const lineHeight = role === "title" ? 1.08 : longForm ? 1.08 : 1.22;
    const blockHeight = size * (1 + (lines.length - 1) * lineHeight);
    return {
      ...block,
      lines,
      size,
      lineHeight,
      blockHeight,
      fontFamily: role === "title" ? palette.title : palette.body,
      fontWeight: block.emphasis === "light" ? 300 : block.emphasis === "strong" || role === "title" ? 700 : 400,
      fontStyle: "normal",
      letterSpacing: role === "title" || block.transform === "uppercase"
        ? (style === DesignStyle.Monumental ? (longForm ? "0.10em" : "0.16em") : (longForm ? "0.04em" : "0.08em"))
        : role === "subtitle" || role === "date"
          ? (longForm ? "0.06em" : "0.12em")
          : longForm ? "0" : "0.02em",
    };
  });

  const gapBase = clamp(safeH * (longForm ? 0.020 : 0.065), longForm ? 1.5 : 5, longForm ? 5 : 16);
  const naturalHeight = prepared.reduce((sum, block) => sum + block.blockHeight, 0)
    + Math.max(0, prepared.length - 1) * gapBase;
  const estimatedMaxWidth = prepared.reduce((widest, block) => {
    const lineWidth = block.lines.reduce((lineWidest, line) => {
      const spacing = Number.parseFloat(block.letterSpacing) || 0;
      return Math.max(lineWidest, estimateTextWidth(line, block.size, spacing));
    }, 0);
    return Math.max(widest, lineWidth);
  }, 0);
  const verticalScale = naturalHeight > safeH ? safeH / naturalHeight : 1;
  const horizontalScale = estimatedMaxWidth > safeW ? safeW / estimatedMaxWidth : 1;
  const fitScale = Math.min(verticalScale, horizontalScale);
  let cursor = -(naturalHeight * fitScale) / 2;

  return prepared.map((block) => {
    const fontSize = block.size * fitScale;
    const firstBaseline = cursor + fontSize * 0.82;
    cursor += block.blockHeight * fitScale + gapBase * fitScale;
    const tspans = block.lines.map((line, lineIndex) =>
      `<tspan x="0" dy="${lineIndex === 0 ? 0 : (fontSize * block.lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`
    ).join("");
    const attrs = [
      `y="${firstBaseline.toFixed(2)}"`,
      `text-anchor="middle"`,
      `font-family="${escapeXml(block.fontFamily)}"`,
      `font-weight="${block.fontWeight}"`,
      `font-size="${fontSize.toFixed(2)}"`,
      `letter-spacing="${block.letterSpacing}"`,
      `fill="currentColor"`,
      block.fontStyle === "italic" ? `font-style="italic"` : "",
    ].filter(Boolean).join(" ");
    return `<text ${attrs}>${tspans}</text>`;
  }).join("\n");
}

async function generateStructuredTextLayout(
  promptText: string,
  width: number,
  height: number,
  shape: Shape,
  designStyle: DesignStyle,
  context?: InscriptionContext
): Promise<StructuredTextLayout> {
  const ai = getAIClient();
  const effectiveStyle = resolveTypographyStyle(designStyle, context);
  const styleDescription = ARCHETYPE_DESCRIPTIONS[effectiveStyle];

  const prompt = `
Turn the user's plaque inscription into a semantic text layout plan.

Return JSON only. Do not return SVG or HTML. Preserve the inscription exactly: same words, spelling, punctuation, casing and order. Do not invent words. Do not change case.

Plaque: ${width}mm x ${height}mm, shape: ${shape}.
Plaque purpose: ${context?.purpose || "commemorative"}.
Portrait relationship: ${context?.portraitRelationship || "No portrait artwork is present. The inscription is the primary composition."}
${context?.layoutGuidance ? `Composer guidance: ${context.layoutGuidance}` : ""}
Style: ${styleDescription}

Use blocks for typographic hierarchy:
- title: the main name/place/event
- subtitle: context under the title
- body: ordinary inscription copy
- accent: one short emotional/script line if suitable
- date: dates or establishment lines

Keep the layout concise: 2-6 blocks. Long body text should stay grouped instead of becoming many tiny blocks.

Inscription:
${promptText}
`;

  const response = await retryWrapper(async () => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoning: { type: Type.STRING },
          blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                text: { type: Type.STRING },
                emphasis: { type: Type.STRING },
                transform: { type: Type.STRING },
              },
              required: ["role", "text"],
            },
          },
        },
        required: ["reasoning", "blocks"],
      },
    },
  }));

  if (!response.text) throw new Error("No structured layout returned from Gemini");
  return normalizeStructuredLayout(JSON.parse(response.text), promptText);
}

export function cleanSvgContent(svg: string): string {
  if (!svg) return "";
  // Strip markdown code blocks (e.g. ```xml ... ``` or ```svg ... ``` or ``` ... ```)
  let cleaned = svg.replace(/```(?:xml|svg|html|code)?/gi, "").trim();
  // Strip any leading/trailing backticks or raw quotes if the LLM outputted them
  cleaned = cleaned.replace(/^`+|`+$/g, "").trim();

  const allowedElements = new Set(["text", "tspan"]);
  const allowedAttributes = new Set([
    "x", "y", "dx", "dy", "text-anchor", "font-family", "font-size",
    "font-weight", "font-style", "letter-spacing", "fill",
  ]);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${cleaned}</svg>`, "image/svg+xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid SVG XML");

    const sanitizeNode = (node: Element): Element | null => {
      const tag = node.tagName.toLowerCase();
      if (!allowedElements.has(tag)) throw new Error(`Unsafe SVG element: ${tag}`);
      validateTypographyAttributes(node);
      const clone = doc.createElementNS("http://www.w3.org/2000/svg", tag);
      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!allowedAttributes.has(name)) throw new Error(`Unsafe SVG attribute: ${name}`);
        if (name === "fill" && attr.value !== "currentColor") throw new Error("Only currentColor fills are allowed");
        clone.setAttribute(name, attr.value);
      });
      if (tag === "text" && !clone.getAttribute("text-anchor")) clone.setAttribute("text-anchor", "middle");
      if (!clone.getAttribute("fill")) clone.setAttribute("fill", "currentColor");

      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          clone.appendChild(doc.createTextNode(child.textContent || ""));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const safeChild = sanitizeNode(child as Element);
          if (safeChild) clone.appendChild(safeChild);
        }
      });
      return clone;
    };

    const svg = doc.querySelector("svg");
    const safeNodes = Array.from(svg?.children || [])
      .map(sanitizeNode)
      .filter(Boolean) as Element[];
    return safeNodes.map(node => new XMLSerializer().serializeToString(node)).join("\n").trim();
  } catch (error) {
    console.warn("Rejected unsafe SVG content.", error);
    return "";
  }
}

// ─── Generation Phase Callback Type ──────────────────────────────
export type GenerationPhase = 'concept' | 'transcribe' | null;

// ─── Stage 1: Generate Concept Image via Gemini Image Gen ────────
const generateConceptImage = async (
  promptText: string,
  width: number,
  height: number,
  shape: Shape,
  designStyle: DesignStyle
): Promise<string | null> => {
  const ai = getAIClient();

  const shapeDesc = shape === Shape.Rect
    ? "rectangular"
    : shape === Shape.Circle
      ? "circular"
      : shape === Shape.Heart
        ? "heart-shaped"
        : "oval";
  const effectiveStyle = designStyle === DesignStyle.Auto ? pickRandomArchetype() : designStyle;
  const archetypeDesc = ARCHETYPE_DESCRIPTIONS[effectiveStyle];
  const palette = pickFontPalette(effectiveStyle);

  const fontHint = palette
    ? `Use fonts that evoke: "${palette.title}" for the title, "${palette.body}" for body text, and "${palette.accent}" for any accent text.`
    : `Use beautiful, premium typography that suits the style.`;

  // Calculate aspect ratio for imageConfig
  const ratio = width / height;
  let aspectRatio: string;
  if (shape === Shape.Circle || shape === Shape.Heart) {
    aspectRatio = "1:1";
  } else if (ratio >= 1.9) {
    aspectRatio = "21:9";
  } else if (ratio >= 1.7) {
    aspectRatio = "16:9";
  } else if (ratio >= 1.4) {
    aspectRatio = "3:2";
  } else if (ratio >= 1.2) {
    aspectRatio = "4:3";
  } else if (ratio >= 0.95) {
    aspectRatio = "1:1";
  } else if (ratio >= 0.7) {
    aspectRatio = "3:4";
  } else if (ratio >= 0.55) {
    aspectRatio = "2:3";
  } else {
    aspectRatio = "9:16";
  }

  const prompt = `
Create a flat, 2D typographic layout for a commemorative plaque sign.

PLAQUE DIMENSIONS: ${width}mm wide × ${height}mm tall (aspect ratio approximately ${width}:${height}). The text layout MUST respect these proportions.

CRITICAL RULES:
- SOLID WHITE background, BLACK text only — pure monochrome, high contrast
- DO NOT draw ANY borders, frames, outlines, decorative lines, separator rules, or edge decorations
- DO NOT draw the plaque shape itself — just the TEXT floating on white
- NO dividers, NO horizontal rules, NO ornamental lines, NO decorative separators
- NO 3D effects, NO shadows, NO metallic textures, NO perspective
- ONLY the words themselves, arranged beautifully. Nothing else.

The plaque will be ${shapeDesc} shaped, ${width}mm × ${height}mm (but do NOT draw the shape boundary).

TYPOGRAPHY IS EVERYTHING:
- The layout must feel like it was designed by a world-class typographer
- Beautiful hierarchy: the main title/name should DOMINATE — large, bold, commanding
- Supporting text should be noticeably smaller, with elegant spacing
- Use varied font weights (heavy title, light body) for dramatic contrast
- Add generous letter-spacing on uppercase words
- Vary the vertical spacing: tight within groups, generous between groups
- Use ONLY typography to create visual rhythm — NO lines or decorative elements

DESIGN STYLE:
${archetypeDesc}

${fontHint}

PLAQUE TEXT CONTENT (use this text, arrange it beautifully):
"${promptText}"

The text should fill the ${width}mm × ${height}mm space generously — no tiny text lost in whitespace.
Remember: ONLY text. NO borders, NO frames, NO lines, NO dividers, NO decorative elements of any kind.
  `;

  try {
    const response = await retryWrapper(async () => {
      return await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: prompt,
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            imageSize: "1K",
            aspectRatio: aspectRatio
          }
        }
      });
    });

    // Extract image data from the response
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Concept image generation failed:", error);
    throw error;
  }
};

// ─── Stage 2: Transcribe Concept Image to SVG ────────────────────
const transcribeConceptToSvg = async (
  conceptImageBase64: string,
  promptText: string,
  width: number,
  height: number,
  shape: Shape,
  designStyle: DesignStyle
): Promise<{ svgContent: string; reasoning: string } | null> => {
  const ai = getAIClient();

  let margin = 20;
  if (shape === Shape.Heart) margin = Math.max(28, Math.min(width, height) * 0.15);
  else if (shape !== Shape.Rect) margin = 40;
  const safeW = width - margin * 2;
  const safeH = height - margin * 2;

  const effectiveStyle = designStyle === DesignStyle.Auto ? pickRandomArchetype() : designStyle;
  const palette = pickFontPalette(effectiveStyle);

  const fontDirective = palette
    ? `USE THIS FONT PALETTE: Title: "${palette.title}" | Body: "${palette.body}" | Accent: "${palette.accent}". You MUST use these specific fonts.`
    : `Choose from these loaded fonts: ${AVAILABLE_FONTS.join(", ")}`;

  const systemPrompt = `
You are a WORLD-CLASS TYPOGRAPHER who transcribes flat graphic plaque designs into clean, semantic SVG code.
You see an IMAGE of a flat, 2D typographic layout concept.

CANVAS: ${width}mm × ${height}mm | Safe area: ${safeW}mm × ${safeH}mm | Origin (0,0) = CENTER of plaque

## FONT DIRECTIVE:
${fontDirective}

## CRITICAL — FAITHFULLY REPRODUCE THE TEXT LAYOUT FROM THE IMAGE:
1. MATCH THE LAYOUT: Replicate the text layout, relative sizes, groupings, and spacing from the image.
2. MATCH THE HIERARCHY: If the title is massive in the image, make it massive in SVG. If body text is tiny, keep it tiny.
3. MATCH THE SPACING: Reproduce the exact vertical rhythm — gaps between groups, line spacing within groups.
4. MAKE IT BIG: Ensure font sizes are generous. The title should be at LEAST ${Math.round(safeW * 0.15)}px. The text block should span 70-85% of the safe area height.

## ABSOLUTELY FORBIDDEN — WILL BREAK THE APP:
- NO <rect> elements — NONE, ZERO, not even for borders or backgrounds
- NO <circle> elements
- NO <ellipse> elements
- NO <polygon> elements
- NO <path> elements — NO decorative lines, NO separator rules, NO dividers
- NO <line> elements
- NO border frames, corner decorations, or edge outlines
- NO horizontal rules or separator lines of any kind
- The app renders borders, frames, and plaque shapes NATIVELY — if you add them, they will cover the plaque and ruin the design

## ALLOWED SVG ELEMENTS ONLY:
- <text> elements with text-anchor="middle" centered on x=0
- <tspan> elements inside text
- NOTHING ELSE. Only <text> and <tspan>.

## SVG OUTPUT RULES:
- All fills: use "currentColor" (NOT hex colors, NOT "black", NOT "white", NOT rgb values)
- y values are RELATIVE to center origin (0,0) — negative = above center, positive = below center
- UPPERCASE text MUST have letter-spacing="0.1em" to "0.3em"

## REFERENCE EXAMPLES (for SVG syntax patterns):
${EXAMPLE_LAYOUTS}
`;

  const userPrompt = `
The attached image is the flat graphic layout concept for a plaque that reads: "${promptText}".
Faithfully transcribe this exact typographic design into clean SVG code following the system rules.
`;

  try {
    const response = await retryWrapper(async () => {
      return await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            { text: userPrompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: conceptImageBase64
              }
            }
          ]
        },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasoning: { type: Type.STRING, description: "Brief analysis of the concept image layout and how you reproduced it" },
              svgContent: { type: Type.STRING, description: "The inner SVG XML content (text elements and optional decorative paths only)" }
            },
            required: ["reasoning", "svgContent"]
          }
        }
      });
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from transcription API");
    const parsed = JSON.parse(text);
    parsed.svgContent = cleanSvgContent(parsed.svgContent);
    return parsed;
  } catch (error) {
    console.error("Concept image transcription failed:", error);
    throw error;
  }
};

// ─── Quick Edit: Modify Existing SVG Directly ────────────────────
const editExistingSvg = async (
  editInstruction: string,
  currentSvgContent: string,
  width: number,
  height: number,
  shape: Shape
): Promise<{ svgContent: string; reasoning: string } | null> => {
  const ai = getAIClient();

  let margin = 20;
  if (shape === Shape.Heart) margin = Math.max(28, Math.min(width, height) * 0.15);
  else if (shape !== Shape.Rect) margin = 40;
  const safeW = width - margin * 2;
  const safeH = height - margin * 2;

  const systemPrompt = `
You are a WORLD-CLASS TYPOGRAPHER editing an existing commemorative plaque design.

CANVAS: ${width}mm × ${height}mm | Safe area: ${safeW}mm × ${safeH}mm | Origin (0,0) = CENTER of plaque

## YOUR TASK:
The user has an existing plaque design (SVG code below) and wants specific changes made.
Apply their requested changes while preserving the overall structure and quality of the design.

## TYPOGRAPHY RULES:
1. MAKE IT BIG — text must be LARGE and LEGIBLE. The title should DOMINATE the plaque.
2. HIERARCHY CONTRAST — at least 2× size jump between title and body.
3. VERTICAL RHYTHM — vary spacing! Tight within groups, generous between groups.
4. LETTER-SPACING — UPPERCASE text needs letter-spacing="0.1em" to "0.3em".

## SVG OUTPUT RULES:
- All text: text-anchor="middle", centered on x=0
- All fills and strokes: use "currentColor"
- Return ONLY <text>, <tspan>, and optional <path> elements
- NO <rect>, <circle>, <ellipse> — no borders, frames, backgrounds

Available fonts: ${AVAILABLE_FONTS.join(", ")}
`;

  const userContent = `CURRENT SVG DESIGN:
\`\`\`svg
${currentSvgContent}
\`\`\`

USER REQUEST: "${editInstruction}"

Apply the requested changes to the design. Preserve the overall structure but make the requested modifications.`;

  try {
    const response = await retryWrapper(async () => {
      return await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userContent,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasoning: { type: Type.STRING, description: "Brief explanation of what edits were made to satisfy the request" },
              svgContent: { type: Type.STRING, description: "The modified SVG content (text elements and optional decorative paths only)" }
            },
            required: ["reasoning", "svgContent"]
          }
        }
      });
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from API");
    const parsed = JSON.parse(text);
    parsed.svgContent = cleanSvgContent(parsed.svgContent);
    return parsed;
  } catch (error) {
    console.error("SVG edit failed:", error);
    throw error;
  }
};

// ─── Main Pipeline: generatePlaqueDesign ─────────────────────────
// This is the single entry point for all layout generation.
// - Current internal mode: accept first-pass typography quickly and let the user regenerate visually
// - Fallback only: image concept → SVG transcription, still sanitized
// - Edit existing: Direct SVG modification, then sanitized
export const generatePlaqueDesign = async (
  promptText: string,
  width: number,
  height: number,
  shape: Shape,
  designStyle: DesignStyle = DesignStyle.Auto,
  currentSvgContent?: string | null,
  onPhaseChange?: (phase: GenerationPhase) => void,
  inscriptionBox?: InscriptionBox,
  inscriptionContext?: InscriptionContext,
  typographyEngine: TypographyEngine = TypographyEngine.ComposerLab,
): Promise<{ svgContent: string; reasoning: string; conceptImageUrl: string | null } | null> => {
  const resolvedStyle = resolveTypographyStyle(designStyle, inscriptionContext);

  // ── EDIT MODE: Modify existing SVG directly (fast, no image gen) ──
  if (currentSvgContent) {
    onPhaseChange?.('transcribe');
    const result = await editExistingSvg(promptText, currentSvgContent, width, height, shape);
    onPhaseChange?.(null);
    if (!result) return null;
    return {
      svgContent: result.svgContent,
      reasoning: result.reasoning,
      conceptImageUrl: null // No new concept image for edits
    };
  }

  const textBox = inscriptionBox || {
    width: Math.max(10, width - (shape === Shape.Rect ? 44 : shape === Shape.Heart ? Math.max(56, Math.min(width, height) * 0.30) : 80)),
    height: Math.max(10, height - (shape === Shape.Rect ? 44 : shape === Shape.Heart ? Math.max(56, Math.min(width, height) * 0.30) : 80)),
  };

  if (typographyEngine === TypographyEngine.ComposerLab && !inscriptionContext?.layoutGuidance) {
    try {
      onPhaseChange?.('transcribe');
      const composition = composeEditorialTypography(promptText, textBox, shape, resolvedStyle);
      onPhaseChange?.(null);
      return {
        svgContent: splitShortLeadInNameLines(composition.svgContent),
        reasoning: `Composer Lab accepted without proof gates: ${composition.reasoning}`,
        conceptImageUrl: null,
      };
    } catch (error) {
      console.warn("Composer Lab failed; trying model-authored typography.", error);
    }
  }

  // ── NEW DESIGN MODE: Gemini owns the composition; local code only proves it is safe and exact. ──
  try {
    onPhaseChange?.('transcribe');
    console.log("Generating model-authored inscription SVG with gemini-3.5-flash...");
    const authoredTypography = await generateAuthoredTypographySvg(
      promptText,
      width,
      height,
      shape,
      resolvedStyle,
      textBox,
      inscriptionContext
    );
    onPhaseChange?.(null);
    return {
      svgContent: authoredTypography.svgContent,
      reasoning: `Model-authored typography accepted without proof gates: ${authoredTypography.reasoning}`,
      conceptImageUrl: null,
    };
  } catch (error) {
    console.warn("Model-authored typography failed; using deterministic local classification.", error);
  }

  // ── LOCAL FALLBACK: Fast context-aware renderer against the same real text box. ──
  try {
    const structuredLayout = inferLocalStructuredLayout(promptText);
    const svgContent = splitShortLeadInNameLines(renderStructuredLayoutToSvg(structuredLayout, textBox.width, textBox.height, shape, resolvedStyle));
    onPhaseChange?.(null);
    return {
      svgContent,
      reasoning: `Local layout accepted without proof gates: ${structuredLayout.reasoning}`,
      conceptImageUrl: null,
    };
  } catch (error) {
    console.warn("Deterministic local classification failed; using the minimal exact-text layout.", error);
  }

  const fallbackLayout = fallbackStructuredLayout(promptText);
  const svgContent = splitShortLeadInNameLines(renderStructuredLayoutToSvg(fallbackLayout, textBox.width, textBox.height, shape, resolvedStyle));
  onPhaseChange?.(null);
  return {
    svgContent,
    reasoning: "Minimal deterministic fallback accepted without proof gates.",
    conceptImageUrl: null,
  };
};

function getRealisticViewAspectRatio(state: PlaqueState): string {
  if (state.shape === Shape.Circle || state.shape === Shape.Heart) return "1:1";

  const ratio = state.width / Math.max(1, state.height);
  if (ratio >= 1.9) return "21:9";
  if (ratio >= 1.7) return "16:9";
  if (ratio >= 1.4) return "3:2";
  if (ratio >= 1.2) return "4:3";
  if (ratio >= 0.95) return "1:1";
  if (ratio >= 0.7) return "3:4";
  if (ratio >= 0.55) return "2:3";
  return "9:16";
}

// ─── Realistic Image Generation ──────────────────────────────────
export const generateRealisticView = async (
  svgBase64: string,
  state: PlaqueState,
  options: RealisticPreviewOptions = {}
): Promise<string | null> => {
  const ai = getAIClient();

  const materials = {
    [Material.BrushedBrass]: {
      name: "Brushed Brass",
      hex: "#C99A35",
      texture: "Hand-brushed satin brass with a fine directional grain",
      details: "Warm brass that has been manually brushed and softened to a satin sheen. Low glare, no mirror reflection, with visible fine horizontal finishing lines and slightly varied gold tones across the face. Avoid glossy gold, foil shine, heavy gradients, or cartoon stripe reflections"
    },
    [Material.OrbitalBrassMattLacquer]: {
      name: "Orbital Finished Brass with Matt Lacquer",
      hex: "#C9AE6A",
      texture: "Very fine orbital micro-abrasion across brass",
      details: "Muted straw-gold brass under a low-sheen matt lacquer, with tiny dense non-directional orbital sanding marks like fine Scotch-Brite or DA sander haze. It should feel flatter and more lacquered than brushed brass"
    },
    [Material.PolishedBrass]: {
      name: "Polished Brass",
      hex: "#F5E050",
      texture: "Mirror-smooth",
      details: "High-gloss mirror brass with sharp reflected highlight bands and strong golden contrast. No visible brush grain"
    },
    [Material.AgedBrass]: {
      name: "Aged Antique Brass",
      hex: "#8B6F4E",
      texture: "Weathered patina",
      details: "Matte finish, uneven oxidation, vintage bronze/brown tones"
    },
    [Material.BrushedSteel]: {
      name: "Brushed Stainless Steel",
      hex: "#C0C0C0",
      texture: "Fine directional stainless brush grain",
      details: "Cool satin stainless with long horizontal hairline brushing, soft diffused highlights, and a restrained industrial silver tone. It is not mirror reflective and should not have chrome-like reflection bands"
    },
    [Material.PolishedSteel]: {
      name: "Mirror Polished Stainless Steel",
      hex: "#E0E0E0",
      texture: "Mirror-smooth",
      details: "Highly reflective stainless steel with crisp but believable bright and dark reflection bands, like a mirror-polished plate. It must be visibly different from brushed stainless and show no directional grain, but avoid cartoon zebra stripes"
    },
  };
  const textColourLabels: Record<TextColor, string> = {
    [TextColor.Black]: "black enamel / black filled etch",
    [TextColor.Grey]: "cool grey filled etch",
    [TextColor.White]: "white filled etch",
    [TextColor.Cream]: "warm cream filled etch",
  };

  const mat = materials[state.material];
  const plaqueAspectRatio = state.width / Math.max(1, state.height);
  const mockupAspectRatio = options.aspectRatio || getRealisticViewAspectRatio(state);
  const orientation = plaqueAspectRatio > 1.01 ? "landscape" : plaqueAspectRatio < 0.99 ? "portrait" : "square";

  const shapeDesc = state.shape === Shape.Rect
    ? (state.cornerRadius > 0 ? "Rounded Rectangle" : "Sharp Rectangle")
    : state.shape === Shape.Circle
      ? "Circle"
      : state.shape === Shape.Heart
        ? "Heart"
        : "Oval";

  let backingDesc = "None (Mounted directly to wall)";
  if (state.wood) {
    const tone = state.woodTone === 'dark' ? "Dark Walnut" : "Light Oak";
    const edge = state.woodEdge === 'bevel' ? "beveled" : "square";

    let backingShape = "Rectangular";
    if (state.shape === Shape.Circle) backingShape = "Round/Circular";
    if (state.shape === Shape.Oval) backingShape = "Oval";
    if (state.shape === Shape.Heart) backingShape = "Heart";

    backingDesc = `Solid Wood Backing Board. Material: ${tone}. Edge: ${edge}. Shape: ${backingShape} (following the contour of the metal plaque with a small border). The metal plate is centered on this wood base.`;
  }

  let hardwareDesc = "Hidden adhesive (VHB) - Floating appearance";
  if (state.shape === Shape.Heart) {
    hardwareDesc = "No visible fixings, no screw holes, no caps. Clean heart-shaped metal plaque face only.";
    backingDesc = "None. No wood backing board for this heart plaque.";
  } else if (state.fixing === Fixing.Screws || state.fixing === Fixing.Caps) {
    const isRect = state.shape === Shape.Rect;
    const count = isRect ? "4x" : "2x";
    const pos = isRect
      ? "in the four corners"
      : "at the horizontal center lines (left and right edges)";

    if (state.fixing === Fixing.Screws) {
      hardwareDesc = `${count} Countersunk Screws positioned ${pos}. Material: ${mat.name}.`;
    } else {
      hardwareDesc = `${count} plain flat decorative metal caps positioned ${pos}. Diameter: ${state.capSize}mm. Material: ${mat.name}. Each cap is only 2-3mm thick: a simple flat circular disc with a flat top face and straight vertical sides. No bevel, no chamfer, no rounded rim, no dome, no bulky standoff shape.`;
    }
  }

  const textColourDesc = textColourLabels[state.textColor] || "black enamel / black filled etch";
  let engravingStyle = `Deep chemical etch, filled with ${textColourDesc}.`;
  if (state.material === Material.OrbitalBrassMattLacquer) {
    engravingStyle = `Precision shallow chemical etching on matt lacquer orbital brass, filled with ${textColourDesc}. Render every line and letter with clean, sharp edges and fine high-resolution detail. The colour fill should sit in a very shallow surface etch and still look lacquered and precise. It must look professionally etched, not deeply carved, routed, embossed, bevelled, soft-edged, blurry, chipped, or shadowed like a deep recess.`;
  }
  if (state.reverseEtch) {
    engravingStyle = `REVERSE ETCH: The background has been chemically etched away to a deep matte black/dark brown finish. The text and any decorative elements are RAISED and remain in polished ${mat.name}, catching the light beautifully. This creates a dramatic contrast between the dark recessed background and the shiny raised metal lettering.`;
  }
  const hasUvPortrait = state.memorialImageEnabled && state.memorialImageMethod === MemorialImageMethod.UvPrinted;
  const portraitFinishInstruction = hasUvPortrait
    ? "Text, border lines, and black geometry are engraved. The portrait is full-colour UV print direct to metal, with crisp ink sitting on the plaque surface."
    : engravingStyle;

  const creativeBrief = options.prompt?.trim()
    ? `
Asset brief from user:
${options.prompt.trim()}

Follow this brief for the scene, camera, setting, lighting, crop, styling and intended asset use. Keep the plaque faithful to the attached stencil and product details. Do not invent extra wording or alter the plaque artwork.
`.trim()
    : "";

  const prompt = `
Create a high-resolution photorealistic product mockup from the attached plaque stencil.

Use the attached image as a placement guide for the plaque outline and engraving/print artwork. Preserve the plaque's ${orientation} orientation, ${plaqueAspectRatio.toFixed(4)}:1 aspect ratio, and approximate relative artwork placement.

Output:
- Generate a ${REALISTIC_PREVIEW_IMAGE_SIZE} image.
- Output aspect ratio: ${mockupAspectRatio}.
${creativeBrief ? `\n${creativeBrief}\n` : ""}

Product details:
- Plaque size: ${state.width}mm x ${state.height}mm.
- Shape: ${shapeDesc}.
- Material: ${mat.name}, ${mat.texture}, ${mat.details}.
- Backing: ${backingDesc}.
- Hardware: ${hardwareDesc}.
- Finish: ${portraitFinishInstruction}.
- Engraving/text colour: ${textColourDesc}. Match this colour in the generated realistic render unless reverse etch is enabled.
- If decorative caps are selected, render them as plain flat circular metal caps, only 2-3mm thick. They should look like thin flat discs sitting on the plaque surface: flat top face, straight vertical side wall, crisp circular edge. No bevel or chamfer. Never render domed button caps, hemispheres, rounded knobs, convex rivets, screw heads, mushroom-shaped hardware, or chunky raised standoffs.
- If the shape is Heart, render a classic upright memorial heart: full rounded lobes, clear central top notch, balanced shoulders, and a defined lower point. Do not make it a wide flattened love-heart.
- If the material is orbital brass with matt lacquer, render a very fine orbital sanding haze: tiny dense overlapping micro-scratch arcs, not visible large swirls or circular rings. The finish should read close to fine brushed grain under matt lacquer, muted lacquered brass, low glare, no mirror reflection. The engraving must be a crisp precision surface etch with hairline-sharp boundaries and clear separation between closely spaced hatch marks. Keep the etch visually shallow and flat, without bevelled walls, rounded grooves, raised rims, heavy recess shadows, bleeding, blur, or loss of fine detail. Use the selected ${textColourDesc} as a precise filled surface etch, not a raised print or blurry ink wash.
- If the material is brushed brass, make it a hand-finished satin brush rather than a shiny polished gold plate: warm brass, fine horizontal hairline grain, soft diffused reflection, subtle variation from manual brushing. Avoid big diagonal bands, foil shine, or CGI gold gradients.
- If the material is brushed stainless, show fine horizontal satin grain and muted reflection, with no chrome reflections. If the material is mirror polished stainless, show smoother mirror-polished reflection contrast instead, with no brush grain and no exaggerated stripe pattern.

Scene:
- Close-up studio product photo, almost front-facing.
- Plain white or light plaster wall background.
- Soft realistic reflections and shadows.
- Do not add extra wording or decorative elements beyond what is implied by the stencil.
`.trim();

  try {
    const response = await retryWrapper(async () => {
      return await ai.models.generateContent({
        model: REALISTIC_PREVIEW_IMAGE_MODEL,
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: svgBase64
              }
            }
          ]
        },
        config: {
          httpOptions: {
            timeout: IMAGE_GENERATION_TIMEOUT_MS,
          },
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            imageSize: REALISTIC_PREVIEW_IMAGE_SIZE,
            aspectRatio: mockupAspectRatio
          }
        }
      });
    });

    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
      }
    }
    return null;

  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
};
