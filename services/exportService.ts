import { PlaqueState, Fixing, MemorialImageMethod } from "../types";

// Type definitions for external libraries loaded via CDN
declare global {
  interface Window {
    opentype: any;
    jspdf: any;
    jsPDF: any;
    svg2pdf: any;
  }
}

// Map fonts to reliable, static WOFF files from JSDelivr (via Fontsource)
const fontMap: Record<string, string> = {
  // Serifs
  "Cinzel": "https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5.0.0/files/cinzel-latin-700-normal.woff",
  "Playfair Display": "https://cdn.jsdelivr.net/npm/@fontsource/playfair-display@5.0.0/files/playfair-display-latin-700-normal.woff",
  "EB Garamond": "https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond@5.0.0/files/eb-garamond-latin-600-normal.woff",
  "Merriweather": "https://cdn.jsdelivr.net/npm/@fontsource/merriweather@5.0.0/files/merriweather-latin-700-normal.woff",
  "Lora": "https://cdn.jsdelivr.net/npm/@fontsource/lora@5.0.0/files/lora-latin-600-normal.woff",
  "Roboto Slab": "https://cdn.jsdelivr.net/npm/@fontsource/roboto-slab@5.0.0/files/roboto-slab-latin-500-normal.woff",
  "Bitter": "https://cdn.jsdelivr.net/npm/@fontsource/bitter@5.0.0/files/bitter-latin-700-normal.woff",
  "Abril Fatface": "https://cdn.jsdelivr.net/npm/@fontsource/abril-fatface@5.0.0/files/abril-fatface-latin-400-normal.woff",

  // Sans
  "Montserrat": "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.0/files/montserrat-latin-600-normal.woff",
  "Open Sans": "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.0/files/open-sans-latin-600-normal.woff",
  "Lato": "https://cdn.jsdelivr.net/npm/@fontsource/lato@5.0.0/files/lato-latin-700-normal.woff",
  "Oswald": "https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.0/files/oswald-latin-600-normal.woff",
  "Raleway": "https://cdn.jsdelivr.net/npm/@fontsource/raleway@5.0.0/files/raleway-latin-700-normal.woff",
  "Bebas Neue": "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.0/files/bebas-neue-latin-400-normal.woff",

  // Scripts / Display
  "Dancing Script": "https://cdn.jsdelivr.net/npm/@fontsource/dancing-script@5.0.0/files/dancing-script-latin-700-normal.woff",
  "Pacifico": "https://cdn.jsdelivr.net/npm/@fontsource/pacifico@5.0.0/files/pacifico-latin-400-normal.woff",
  "Satisfy": "https://cdn.jsdelivr.net/npm/@fontsource/satisfy@5.0.0/files/satisfy-latin-400-normal.woff",
  "Caveat": "https://cdn.jsdelivr.net/npm/@fontsource/caveat@5.0.0/files/caveat-latin-700-normal.woff",
  "Pinyon Script": "https://cdn.jsdelivr.net/npm/@fontsource/pinyon-script@5.0.0/files/pinyon-script-latin-400-normal.woff",
  "Allura": "https://cdn.jsdelivr.net/npm/@fontsource/allura@5.0.0/files/allura-latin-400-normal.woff",
  "Alex Brush": "https://cdn.jsdelivr.net/npm/@fontsource/alex-brush@5.0.0/files/alex-brush-latin-400-normal.woff",
  "Great Vibes": "https://cdn.jsdelivr.net/npm/@fontsource/great-vibes@5.0.0/files/great-vibes-latin-400-normal.woff",
};

const DEFAULT_FALLBACK_FONT = "Open Sans";
const scriptPromises = new Map<string, Promise<void>>();
const scriptFontFamilies = new Set([
  "Alex Brush",
  "Allura",
  "Caveat",
  "Dancing Script",
  "Great Vibes",
  "Pacifico",
  "Pinyon Script",
  "Satisfy",
]);
const fontVariants: Record<string, { normal: number[]; italic?: number[] }> = {
  "Abril Fatface": { normal: [400] },
  "Alex Brush": { normal: [400] },
  "Allura": { normal: [400] },
  "Bebas Neue": { normal: [400] },
  "Bitter": { normal: [400, 700] },
  "Caveat": { normal: [400, 700] },
  "Cinzel": { normal: [400, 700, 900] },
  "Dancing Script": { normal: [400, 700] },
  "EB Garamond": { normal: [400, 600, 700] },
  "Great Vibes": { normal: [400] },
  "Lato": { normal: [300, 400, 700] },
  "Lora": { normal: [400, 600, 700], italic: [400] },
  "Merriweather": { normal: [300, 400, 700] },
  "Montserrat": { normal: [400, 600, 700, 800] },
  "Open Sans": { normal: [300, 400, 600, 700] },
  "Oswald": { normal: [400, 600, 700] },
  "Pacifico": { normal: [400] },
  "Pinyon Script": { normal: [400] },
  "Playfair Display": { normal: [400, 700, 900], italic: [400] },
  "Raleway": { normal: [300, 400, 500, 700] },
  "Roboto Slab": { normal: [300, 500, 700] },
  "Satisfy": { normal: [400] },
};

const loadScript = (src: string) => {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
};

const ensureOpenType = async () => {
  if (!window.opentype) {
    await loadScript("https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js");
  }
};

const ensurePdfLibraries = async () => {
  if (!window.jspdf?.jsPDF && !window.jsPDF) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  }
  window.jsPDF = window.jsPDF || window.jspdf?.jsPDF;
  if (!window.svg2pdf) {
    await loadScript("https://unpkg.com/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js");
  }
};

const firstFontFamily = (ff: string) => ff ? ff.split(",")[0].trim().replace(/^["']|["']$/g, "") : "";
const fontSlug = (family: string) => family.toLowerCase().replace(/\s+/g, "-");
const normalizedWeight = (weight: string) => {
  const lower = weight.trim().toLowerCase();
  if (lower === "bold" || lower === "bolder") return 700;
  if (lower === "normal" || lower === "regular") return 400;
  if (lower === "lighter" || lower === "light") return 300;
  const parsed = Number.parseInt(weight, 10);
  if (!Number.isFinite(parsed)) return 400;
  return Math.min(900, Math.max(300, Math.round(parsed / 100) * 100));
};
const closestWeight = (family: string, weight: number, style: string) => {
  const variants = fontVariants[family];
  const weights = (style === "italic" ? variants?.italic : variants?.normal) || variants?.normal;
  if (!weights?.length) return weight;
  return weights.reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best
  );
};
const fontDescriptor = (family: string, weight: string, style: string) =>
  `${family}::${closestWeight(family, normalizedWeight(weight), style === "italic" ? "italic" : "normal")}::${style === "italic" ? "italic" : "normal"}`;
const fontUrlForDescriptor = (descriptor: string) => {
  const [family, weight, style] = descriptor.split("::");
  const slug = fontSlug(family);
  return `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@5.0.0/files/${slug}-latin-${weight}-${style}.woff`;
};
const parseLength = (value: string | null, fontSize: number) => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "normal") return 0;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return trimmed.endsWith("em") ? parsed * fontSize : parsed;
};

const loadFontsUsedInLayer = async (liveLayer: Element) => {
  const descriptors = new Set<string>();
  const elems = Array.from(liveLayer.querySelectorAll("text, tspan"));

  descriptors.add(fontDescriptor(DEFAULT_FALLBACK_FONT, "600", "normal"));

  elems.forEach((node) => {
    const style = window.getComputedStyle(node);
    const fam = firstFontFamily(node.getAttribute("font-family") || style.fontFamily);
    if (fam) {
      descriptors.add(fontDescriptor(
        fam,
        node.getAttribute("font-weight") || style.fontWeight,
        node.getAttribute("font-style") || style.fontStyle
      ));
    }
  });

  const loadedFonts: Record<string, any> = {};

  await Promise.all(Array.from(descriptors).map(async (descriptor) => {
    const [fam] = descriptor.split("::");
    const urls = [fontUrlForDescriptor(descriptor), fontMap[fam]].filter(Boolean);
    try {
      for (const url of urls) {
        try {
          const buff = await fetch(url).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
          });
          loadedFonts[descriptor] = window.opentype.parse(buff);
          if (!loadedFonts[fam]) loadedFonts[fam] = loadedFonts[descriptor];
          return;
        } catch {
          // Try the curated family fallback when an exact variant is unavailable.
        }
      }
      throw new Error("No matching font file");
    } catch (e) {
      console.error(`FAILED to load font "${descriptor}".`, e);
    }
  }));

  return loadedFonts;
};

const assertTextLayerOutlined = (cloneSvg: SVGSVGElement) => {
  const remainingText = Array.from(cloneSvg.querySelectorAll("#ai-text-layer text"))
    .filter(text => (text.textContent || "").trim().length > 0);
  if (remainingText.length > 0) {
    throw new Error("Production export could not freeze all preview text to vector paths. Check font loading before exporting.");
  }
};

const visibleTextRunCount = (layer: Element) =>
  Array.from(layer.querySelectorAll("text")).reduce((count, text) => {
    const directText = Array.from(text.childNodes).some((child) =>
      child.nodeType === Node.TEXT_NODE && (child.textContent || "").trim().length > 0
    );
    const tspanCount = Array.from(text.querySelectorAll("tspan"))
      .filter(tspan => (tspan.textContent || "").trim().length > 0)
      .length;
    return count + (directText ? 1 : 0) + tspanCount;
  }, 0);

const loadBrowserFontsUsedInLayer = async (layer: Element) => {
  if (!document.fonts?.load) return;
  const nodes = Array.from(layer.querySelectorAll("text, tspan"))
    .filter(node => (node.textContent || "").trim().length > 0);

  await Promise.all(nodes.map(async (node) => {
    const style = window.getComputedStyle(node);
    const family = style.fontFamily || node.getAttribute("font-family");
    if (!family) return;
    const font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${family}`;
    try {
      await document.fonts.load(font, node.textContent || "");
    } catch {
      // The export font loader below will still fail closed if outlining cannot
      // find a matching font. This step is for browser measurement parity.
    }
  }));
  await document.fonts.ready;
};

const waitForSvgTextLayout = async (layer?: Element) => {
  if (layer) await loadBrowserFontsUsedInLayer(layer);
  else await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const recomputePreviewFitTransform = (
  sourceTextGroup: Element,
  cloneTextGroup: Element,
) => {
  const fitW = Number.parseFloat(sourceTextGroup.getAttribute("data-fit-width") || "");
  const fitH = Number.parseFloat(sourceTextGroup.getAttribute("data-fit-height") || "");
  const userScale = Number.parseFloat(sourceTextGroup.getAttribute("data-fit-scale") || "1");
  const inscriptionScale = Number.isFinite(userScale) ? Math.max(0.1, userScale) : 1;
  if (!Number.isFinite(fitW) || !Number.isFinite(fitH) || fitW <= 0 || fitH <= 0) {
    const groupTransform = sourceTextGroup.getAttribute("transform");
    if (groupTransform) cloneTextGroup.setAttribute("transform", groupTransform);
    return;
  }

  try {
    const bbox = (sourceTextGroup as SVGGElement).getBBox();
    if (!bbox.width || !bbox.height) return;

    const scale = Math.min(fitW / bbox.width, fitH / bbox.height, 3.0) * inscriptionScale;
    const centerOffsetX = -(bbox.x + bbox.width / 2);
    const centerOffsetY = -(bbox.y + bbox.height / 2);
    cloneTextGroup.setAttribute(
      "transform",
      `scale(${scale}) translate(${centerOffsetX}, ${centerOffsetY})`
    );
  } catch {
    const groupTransform = sourceTextGroup.getAttribute("transform");
    if (groupTransform) cloneTextGroup.setAttribute("transform", groupTransform);
  }
};

const translatePathToSourceBBox = (pathEl: SVGPathElement, sourceRun: SVGTextContentElement) => {
  try {
    const sourceBox = sourceRun.getBBox();
    const pathBox = pathEl.getBBox();
    if (!pathBox.width || !pathBox.height) return;

    const dx = sourceBox.x - pathBox.x;
    const dy = sourceBox.y - pathBox.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    const existingTransform = pathEl.getAttribute("transform");
    const registration = `translate(${dx}, ${dy})`;
    pathEl.setAttribute("transform", existingTransform ? `${registration} ${existingTransform}` : registration);
  } catch {
    // Keep the generated outline if browser bbox measurement is unavailable.
  }
};

// Convert text nodes to path data
const outlineTextLayer = async (
  cloneSvg: SVGSVGElement,
  sourceSvg: SVGSVGElement,
  options: { pathFill?: string } = {},
) => {
  await ensureOpenType();
  const cloneTextGroup = cloneSvg.querySelector("#ai-text-layer");
  const sourceTextGroup = sourceSvg.querySelector("#ai-text-layer");

  if (!cloneTextGroup || !sourceTextGroup) return;

  // Gemini-authored typography often selects fonts that have not been used
  // elsewhere on the page. Measure only after browser font layout has settled,
  // otherwise bbox registration can compare fallback-font preview geometry
  // against real-font outlined geometry.
  await waitForSvgTextLayout(sourceTextGroup);
  // Export must not depend on whether React has already committed the latest
  // preview fit transform. Recompute it from the measured live text and the
  // explicit inscription-box dimensions immediately before freezing paths.
  recomputePreviewFitTransform(sourceTextGroup, cloneTextGroup);

  const loadedFonts = await loadFontsUsedInLayer(sourceTextGroup);
  const fallbackFont = loadedFonts[DEFAULT_FALLBACK_FONT]
    || loadedFonts[fontDescriptor(DEFAULT_FALLBACK_FONT, "600", "normal")];

  const cloneTextEls = Array.from(cloneTextGroup.querySelectorAll("text"));
  const sourceTextEls = Array.from(sourceTextGroup.querySelectorAll("text"));
  const expectedRunCount = visibleTextRunCount(sourceTextGroup);
  const initialPathCount = cloneTextGroup.querySelectorAll("path").length;

  for (let i = 0; i < cloneTextEls.length; i++) {
    const textEl = cloneTextEls[i];
    const sourceEl = sourceTextEls[i];
    if (!sourceEl) continue;

    const cloneTspans = Array.from(textEl.querySelectorAll("tspan"));
    const sourceTspans = Array.from(sourceEl.querySelectorAll("tspan"));

    const isMultiPart = cloneTspans.length > 0;
    const runs = isMultiPart ? cloneTspans : [textEl];
    const sourceRuns = isMultiPart ? sourceTspans : [sourceEl];

    let fullyConverted = true;

    for (let j = 0; j < runs.length; j++) {
      const run = runs[j];
      const sourceRun = sourceRuns[j] as SVGTextContentElement;

      const textContent = run.textContent || "";
      if (!textContent.trim()) continue;

      const style = window.getComputedStyle(sourceRun);
      const fam = firstFontFamily(sourceRun.getAttribute("font-family") || style.fontFamily);
      const descriptor = fontDescriptor(
        fam,
        sourceRun.getAttribute("font-weight") || style.fontWeight,
        sourceRun.getAttribute("font-style") || style.fontStyle
      );

      let font = loadedFonts[descriptor] || loadedFonts[fam] || fallbackFont;
      if (!font) {
        console.error(`CRITICAL: No fonts available for "${textContent}".`);
        run.setAttribute("fill", "#FF0000");
        fullyConverted = false;
        continue;
      }

      // Robust Font Size Detection: Prefer Attribute over Computed Style (which returns px on screen)
      let fontSize = 12;
      const fsAttr = sourceRun.getAttribute("font-size") || sourceRun.parentElement?.getAttribute("font-size");
      if (fsAttr) {
        fontSize = parseFloat(fsAttr.replace("px", ""));
      } else {
        // Fallback to style only if attribute is missing, but be wary of unit mismatch
        fontSize = parseFloat(style.fontSize) || 12;
      }

      let pathData = "";
      let usedBrowserLayout = false;
      const letterSpacing = parseLength(
        sourceRun.getAttribute("letter-spacing")
        || sourceRun.parentElement?.getAttribute("letter-spacing")
        || style.letterSpacing,
        fontSize
      );
      // Script faces rely on contextual forms. Splitting them into individual
      // glyph paths destroys the joins even when browser char positions are
      // correct, so always outline script text as a shaped run.
      const shouldKeepWholeRun = scriptFontFamilies.has(fam);

      if (shouldKeepWholeRun) {
        try {
          const pt = sourceRun.getStartPositionOfChar(0);
          const runPath = font.getPath(textContent, pt.x, pt.y, fontSize);
          pathData = runPath.toPathData(2);
          usedBrowserLayout = pathData.trim().length > 0;
        } catch {
          // Fall back to the generic outline logic below.
        }
      } else {
        // Outline one character at a time at the browser-calculated positions.
        // This preserves SVG text-anchor, kerning and letter-spacing exactly.
        try {
          const charCount = sourceRun.getNumberOfChars();
          if (charCount > 0) {
            for (let charIndex = 0; charIndex < charCount; charIndex++) {
              const char = textContent[charIndex];
              if (!char || !char.trim()) continue;

              const pt = sourceRun.getStartPositionOfChar(charIndex);
              const charPath = font.getPath(char, pt.x, pt.y, fontSize);
              pathData += `${charPath.toPathData(2)} `;
            }
            usedBrowserLayout = pathData.trim().length > 0;
          }
        } catch (e) {
          // Fall back to whole-run layout for unusual SVG text nodes.
        }
      }

      if (!usedBrowserLayout) {
        const textAnchor = sourceRun.getAttribute("text-anchor") || style.textAnchor || "start";
        let xAttr = run.getAttribute("x");
        let yAttr = run.getAttribute("y");

        // Inherit from parent text if tspan missing coords
        if (!xAttr && textEl.getAttribute("x")) xAttr = textEl.getAttribute("x");
        if (!yAttr && textEl.getAttribute("y")) yAttr = textEl.getAttribute("y");

        let x = parseFloat(xAttr || "0");
        let y = parseFloat(yAttr || "0");

        const width = font.getAdvanceWidth(textContent, fontSize);

        if (textAnchor === "middle") x -= width / 2;
        if (textAnchor === "end") x -= width;

        const runPath = font.getPath(textContent.trim(), x, y, fontSize);
        pathData = runPath.toPathData(2);
      }

      try {
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("d", pathData);
        pathEl.setAttribute("fill", options.pathFill || "#000000");
        pathEl.setAttribute("stroke", "none");

        // Preserve transform from the text element itself (e.g. if individual text was rotated)
        // But do NOT apply group transforms here, they are on the parent group.
        const transform = run.getAttribute("transform");
        if (transform) pathEl.setAttribute("transform", transform);

        if (textEl.parentNode) {
          textEl.parentNode.insertBefore(pathEl, textEl);
          if (shouldKeepWholeRun) {
            translatePathToSourceBBox(pathEl, sourceRun);
          }
        }
      } catch (err) {
        console.warn(`Could not generate path for text "${textContent}".`, err);
        fullyConverted = false;
      }
    }

    if (fullyConverted) {
      textEl.remove();
    }
  }

  assertTextLayerOutlined(cloneSvg);
  const producedRunCount = cloneTextGroup.querySelectorAll("path").length - initialPathCount;
  if (producedRunCount < expectedRunCount) {
    throw new Error("Production export skipped part of the preview text while outlining. Regenerate the inscription layout and export again.");
  }
};

export const outlinePreviewTextLayer = async (
  cloneSvg: SVGSVGElement,
  sourceSvg: SVGSVGElement,
  options: { pathFill?: string } = {},
) => {
  await outlineTextLayer(cloneSvg, sourceSvg, options);
};

const prepareCloneForProduction = async (sourceSvg: SVGSVGElement, state: PlaqueState) => {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;

  // The live preview SVG is the geometry source of truth. Reusing its actual
  // viewBox avoids export-time size drift if preview dimensions and state ever
  // get out of step during generated layout updates.
  const previewBox = sourceSvg.viewBox.baseVal;
  const totalW = previewBox.width || Number(sourceSvg.getAttribute("width")) || state.width + (state.wood ? 25 : 0);
  const totalH = previewBox.height || Number(sourceSvg.getAttribute("height")) || state.height + (state.wood ? 25 : 0);
  const minX = previewBox.width ? previewBox.x : 0;
  const minY = previewBox.height ? previewBox.y : 0;
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.setAttribute("width", `${totalW}mm`);
  clone.setAttribute("height", `${totalH}mm`);
  clone.setAttribute("viewBox", `${minX} ${minY} ${totalW} ${totalH}`);

  // Ensure the clone is in the DOM so getStartPositionOfChar works
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.top = "-10000px";
  wrapper.style.left = "-10000px";
  wrapper.style.opacity = "0.01";
  wrapper.style.pointerEvents = "none";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    await outlineTextLayer(clone, sourceSvg);

    // ======= CLEAN FOR CORELDRAW =======

    // 1. Keep the exact preview transform hierarchy.
    // The proof SVG is the source of truth; export must not rewrite the
    // text-layer translate/scale chain after the browser has fitted it.

    // 2. Remove ALL visual-only elements (noise, patina, shadows, portrait guides)
    clone.querySelectorAll('.visual-effect').forEach(el => el.remove());
    clone.querySelectorAll('.portrait-placeholder').forEach(el => el.remove());
    if (
      state.memorialImageEnabled &&
      state.memorialImageMethod === MemorialImageMethod.Engraved &&
      !state.memorialImageSvg
    ) {
      clone.querySelector('#memorial-artwork-layer')?.remove();
    }

    // 3. Process Wood Backing -> blue cut line
    const woodBacking = clone.querySelector('.wood-backing');
    if (woodBacking) {
      woodBacking.removeAttribute('filter');
      const shapes = Array.from(woodBacking.querySelectorAll('rect, ellipse, path'));
      shapes.forEach((shape, index) => {
        if (index === 0) {
          shape.removeAttribute('fill');
          shape.setAttribute('fill', 'none');
          shape.setAttribute('stroke', '#0000FF');
          shape.setAttribute('stroke-width', '0.25');
          shape.removeAttribute('filter');
          shape.removeAttribute('style');
        } else {
          shape.remove();
        }
      });
    }

    // 4. Process Cut Line -> red cut line
    const cutLine = clone.querySelector('.cut-line') as SVGElement | null;
    if (cutLine) {
      cutLine.removeAttribute('fill');
      cutLine.setAttribute('fill', 'none');
      cutLine.setAttribute('stroke', '#FF0000');
      cutLine.setAttribute('stroke-width', '0.25');
      cutLine.removeAttribute('filter');
      cutLine.removeAttribute('style');
    }

    // 5. Process Fixings -> simple red circles
    const fixingsLayer = clone.querySelector('#fixings-layer');
    if (fixingsLayer) {
      const groups = fixingsLayer.querySelectorAll('g');
      groups.forEach(g => {
        const mainCircle = g.querySelector('circle');
        if (mainCircle) {
          const newCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          newCircle.setAttribute("cx", mainCircle.getAttribute("cx") || "0");
          newCircle.setAttribute("cy", mainCircle.getAttribute("cy") || "0");
          newCircle.setAttribute("r", "2.5");
          newCircle.setAttribute("fill", "none");
          newCircle.setAttribute("stroke", "#FF0000");
          newCircle.setAttribute("stroke-width", "0.25");
          g.parentNode?.insertBefore(newCircle, g);
          g.remove();
        } else {
          g.remove();
        }
      });
    }

    // 6. Process Engraved borders -> black engrave line
    clone.querySelectorAll('.engraved-border').forEach(el => {
      el.removeAttribute('fill');
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', '#000000');
      el.setAttribute('stroke-width', '0.5');
      el.removeAttribute('filter');
      el.removeAttribute('style');
    });

    // 7. Ensure all text paths are black filled
    clone.querySelectorAll('path').forEach(path => {
      if (path.classList.contains('engraved-border') ||
        path.getAttribute('stroke') === '#FF0000' ||
        path.getAttribute('stroke') === '#0000FF') return;
      path.setAttribute('fill', '#000000');
      path.setAttribute('stroke', 'none');
    });

    // 8. Remove visual defs but retain UV portrait clipping geometry.
    clone.querySelectorAll('defs').forEach(defs => {
      const portraitClip = defs.querySelector('#uv-portrait-shape');
      if (!portraitClip) {
        defs.remove();
        return;
      }
      Array.from(defs.children).forEach(child => {
        if (child !== portraitClip) child.remove();
      });
    });

    // 9. Strip all visual-only attributes everywhere
    clone.querySelectorAll('filter, style').forEach(el => el.remove());
    clone.querySelectorAll('*').forEach(el => {
      el.removeAttribute('filter');
      el.removeAttribute('style');
      el.removeAttribute('class');
      if (el.getAttribute('opacity')) el.removeAttribute('opacity');
    });

    // 10. Unwrap the plate-group <g> (had filter="url(#dropShadow)")
    const plateGroup = clone.querySelector('[id="plate-group"]');
    if (plateGroup && plateGroup.tagName === 'g') {
      while (plateGroup.firstChild) {
        plateGroup.parentNode?.insertBefore(plateGroup.firstChild, plateGroup);
      }
      plateGroup.remove();
    }

    // 11. Clean up IDs that are not still used by clip paths.
    const referencedIds = new Set(
      Array.from(clone.querySelectorAll('*'))
        .flatMap(el => Array.from(el.attributes))
        .map(attr => attr.value.match(/url\(#([^)]+)\)/)?.[1])
        .filter((id): id is string => !!id)
    );
    clone.querySelectorAll('*').forEach(el => {
      const id = el.getAttribute('id');
      if (id && !referencedIds.has(id)) el.removeAttribute('id');
    });

    return clone;
  } finally {
    document.body.removeChild(wrapper);
  }
};

export const downloadCorelSvg = async (sourceSvg: SVGSVGElement, state: PlaqueState) => {
  try {
    const clone = await prepareCloneForProduction(sourceSvg, state);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `plaque_${state.width}x${state.height}_${state.material}.svg`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    // Clean up after a short delay to ensure download starts
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (e) {
    console.error("Export failed", e);
    alert("Export failed: " + e);
  }
};

export const downloadPdf = async (sourceSvg: SVGSVGElement, state: PlaqueState) => {
  try {
    await ensurePdfLibraries();
    const jsPDFCtor = window.jsPDF || window.jspdf?.jsPDF;
    if (!jsPDFCtor) throw new Error("PDF Library not loaded. Please refresh.");

    const clone = await prepareCloneForProduction(sourceSvg, state);
    const viewBox = clone.viewBox.baseVal;
    const widthMm = viewBox.width || state.width + (state.wood ? 25 : 0);
    const heightMm = viewBox.height || state.height + (state.wood ? 25 : 0);
    const doc = new jsPDFCtor({
      orientation: widthMm >= heightMm ? "l" : "p",
      unit: "mm",
      format: [widthMm, heightMm],
      compress: true,
    });

    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.top = "-10000px";
    wrapper.style.left = "-10000px";
    wrapper.style.opacity = "0.01";
    wrapper.style.pointerEvents = "none";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      await doc.svg(clone, { x: 0, y: 0, width: widthMm, height: heightMm });
      doc.save(`plaque_${widthMm}x${heightMm}_${state.material}.pdf`);
    } finally {
      document.body.removeChild(wrapper);
    }
  } catch (e) {
    console.error("PDF Export failed", e);
    alert("PDF Export failed: " + e);
  }
};

export const svgToPngBase64 = async (sourceSvg: SVGSVGElement): Promise<string> => {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  const vb = sourceSvg.viewBox.baseVal;
  const scale = 1024 / vb.width;
  const w = Math.round(vb.width * scale);
  const h = Math.round(vb.height * scale);
  clone.setAttribute("width", `${w}px`);
  clone.setAttribute("height", `${h}px`);

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.top = "-9999px";
  wrapper.style.left = "-9999px";
  wrapper.style.opacity = "0";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    await outlineTextLayer(clone, sourceSvg);

    // Realistic View needs a strict registration mask, not the styled preview.
    // Keep only the plaque outline and the geometry that must be engraved.
    clone.querySelector(".wood-backing")?.remove();
    clone.querySelector("#fixings-layer")?.remove();
    clone.querySelectorAll(".visual-effect").forEach(el => el.remove());
    clone.querySelectorAll(".portrait-placeholder").forEach(el => el.remove());

    const cutLine = clone.querySelector(".cut-line");
    if (cutLine) {
      cutLine.setAttribute("fill", "#ffffff");
      cutLine.setAttribute("stroke", "#9ca3af");
      cutLine.setAttribute("stroke-width", "0.75");
      cutLine.removeAttribute("style");
    }

    clone.querySelectorAll(".engraved-border").forEach(el => {
      el.setAttribute("stroke", "#000000");
      el.setAttribute("fill", "none");
      el.setAttribute("stroke-width", "1");
      el.removeAttribute("style");
    });

    clone.querySelectorAll("#ai-text-layer path, #memorial-artwork-layer path").forEach(el => {
      el.setAttribute("fill", "#000000");
      el.setAttribute("stroke", "none");
      el.removeAttribute("style");
    });

    clone.querySelectorAll("filter").forEach(el => el.remove());
    clone.querySelectorAll("defs").forEach(defs => {
      if (!defs.querySelector("#uv-portrait-shape")) defs.remove();
    });
    clone.querySelectorAll("[filter]").forEach(el => el.removeAttribute("filter"));
    clone.querySelectorAll("[style]").forEach(el => el.removeAttribute("style"));

    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Canvas error");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png").split(",")[1]);
      };
      img.onerror = reject;
      img.src = image64;
    });
  } finally {
    document.body.removeChild(wrapper);
  }
};
