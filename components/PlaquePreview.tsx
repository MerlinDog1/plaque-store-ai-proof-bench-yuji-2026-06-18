import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BorderStyle, PlaqueState, Shape, Fixing, Material, TEXT_COLOR_VALUES, MemorialImageMethod, DesignStyle, MemorialImageShape } from '../types';
import { getInscriptionLayout } from '../services/inscriptionLayout';

interface Props {
  state: PlaqueState;
  activeStep: number;
  inscription: string;
}

function getEllipseXAtY(rx: number, ry: number, y: number) {
  if (rx <= 0 || ry <= 0) return 0;
  const normalizedY = Math.min(0.98, Math.abs(y) / ry);
  return rx * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
}

function getEllipseCircleIntersectionY(rx: number, ry: number, radius: number) {
  const maxY = Math.min(radius * 0.995, ry * 0.92);
  if (rx <= 0 || ry <= 0 || radius <= 0 || maxY <= 0) return 0;

  const delta = (y: number) => {
    const ellipseInset = rx - getEllipseXAtY(rx, ry, y);
    const circleInset = Math.sqrt(Math.max(0, radius * radius - y * y));
    return ellipseInset - circleInset;
  };

  if (delta(maxY) < 0) return maxY;

  let low = 0;
  let high = maxY;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (delta(mid) < 0) low = mid;
    else high = mid;
  }
  return high;
}

function getSvgPayload(svg: string | null): { viewBox: string; content: string } | null {
  if (!svg) return null;
  const viewBox = svg.match(/viewBox=["']([^"']+)["']/i)?.[1] || "0 0 100 100";
  const content = svg
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>/i, "")
    .replace(/<rect[^>]*fill=["']white["'][^>]*\/?>/gi, "")
    .replace(/fill=["']#000000["']/gi, 'fill="currentColor"')
    .replace(/fill=["']black["']/gi, 'fill="currentColor"');
  return { viewBox, content };
}

function getViewBoxCenter(viewBox: string) {
  const [x = 0, y = 0, width = 100, height = 100] = viewBox.split(/\s+/).map(Number);
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}

function heartPathD(x: number, y: number, width: number, height: number, inset = 0) {
  const left = x + inset;
  const top = y + inset;
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  return [
    `M ${left + w * 0.50} ${top + h * 0.94}`,
    `C ${left + w * 0.22} ${top + h * 0.75}, ${left + w * 0.05} ${top + h * 0.58}, ${left + w * 0.05} ${top + h * 0.34}`,
    `C ${left + w * 0.05} ${top + h * 0.13}, ${left + w * 0.29} ${top + h * 0.06}, ${left + w * 0.42} ${top + h * 0.20}`,
    `C ${left + w * 0.47} ${top + h * 0.25}, ${left + w * 0.49} ${top + h * 0.31}, ${left + w * 0.50} ${top + h * 0.35}`,
    `C ${left + w * 0.51} ${top + h * 0.31}, ${left + w * 0.53} ${top + h * 0.25}, ${left + w * 0.58} ${top + h * 0.20}`,
    `C ${left + w * 0.71} ${top + h * 0.06}, ${left + w * 0.95} ${top + h * 0.13}, ${left + w * 0.95} ${top + h * 0.34}`,
    `C ${left + w * 0.95} ${top + h * 0.58}, ${left + w * 0.78} ${top + h * 0.75}, ${left + w * 0.50} ${top + h * 0.94}`,
    "Z",
  ].join(" ");
}

const portraitShapeClip = (shape: MemorialImageShape) => {
  if (shape === MemorialImageShape.Circle) return <circle cx="50" cy="50" r="49" />;
  if (shape === MemorialImageShape.Heart) {
    return (
      <path d="M50 88 C18 66 8 49 13 31 C17 17 32 12 43 24 C46 27 48 30 50 34 C52 30 54 27 57 24 C68 12 83 17 87 31 C92 49 82 66 50 88 Z" />
    );
  }
  return <rect x="1" y="1" width="98" height="98" rx="4" />;
};

const WORDS_DRAFT_TYPOGRAPHY: Record<DesignStyle, {
  titleFont: string;
  bodyFont: string;
  titleWeight: number;
  titleSpacing: string;
  bodySpacing: string;
}> = {
  [DesignStyle.Auto]:             { titleFont: 'Cinzel',           bodyFont: 'Lato',        titleWeight: 700, titleSpacing: '0.08em', bodySpacing: '0.08em' },
  [DesignStyle.Monumental]:       { titleFont: 'Bebas Neue',       bodyFont: 'Montserrat',  titleWeight: 700, titleSpacing: '0.12em', bodySpacing: '0.07em' },
  [DesignStyle.ClassicalFormal]:  { titleFont: 'Playfair Display', bodyFont: 'Lato',        titleWeight: 700, titleSpacing: '0.05em', bodySpacing: '0.08em' },
  [DesignStyle.ModernMinimal]:    { titleFont: 'Montserrat',       bodyFont: 'Raleway',     titleWeight: 600, titleSpacing: '0.14em', bodySpacing: '0.12em' },
  [DesignStyle.HeritagePlaque]:   { titleFont: 'Cinzel',           bodyFont: 'EB Garamond', titleWeight: 700, titleSpacing: '0.06em', bodySpacing: '0.07em' },
  [DesignStyle.MemorialSolemn]:   { titleFont: 'Playfair Display', bodyFont: 'Lato',        titleWeight: 600, titleSpacing: '0.04em', bodySpacing: '0.09em' },
  [DesignStyle.ContemporaryBold]: { titleFont: 'Oswald',           bodyFont: 'Montserrat',  titleWeight: 700, titleSpacing: '0.09em', bodySpacing: '0.08em' },
  [DesignStyle.ArtisanCraft]:     { titleFont: 'Lora',             bodyFont: 'Great Vibes', titleWeight: 700, titleSpacing: '0.04em', bodySpacing: '0.04em' },
  [DesignStyle.Institutional]:    { titleFont: 'Montserrat',       bodyFont: 'Open Sans',   titleWeight: 700, titleSpacing: '0.13em', bodySpacing: '0.11em' },
};

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

function firstFontFamily(fontFamily: string | null) {
  return fontFamily ? fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "") : "";
}

function normalizeScriptTypography(svgContent: string | null) {
  if (!svgContent || typeof DOMParser === "undefined") return svgContent;
  try {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`,
      "image/svg+xml"
    );
    if (doc.querySelector("parsererror")) return svgContent;

    Array.from(doc.querySelectorAll("text, tspan")).forEach((node) => {
      const element = node as SVGElement;
      const parent = element.parentElement as unknown as SVGElement | null;
      const family = firstFontFamily(
        element.getAttribute("font-family")
        || parent?.getAttribute("font-family")
        || ""
      );
      if (SCRIPT_FONT_FAMILIES.has(family)) {
        element.removeAttribute("letter-spacing");
        element.removeAttribute("font-style");
      }
    });

    return doc.documentElement.innerHTML;
  } catch {
    return svgContent;
  }
}

async function loadSvgTextFonts(group: SVGGElement) {
  if (!document.fonts?.load) return;
  const nodes = Array.from(group.querySelectorAll("text, tspan"))
    .filter(node => (node.textContent || "").trim().length > 0);

  await Promise.all(nodes.map(async (node) => {
    const style = window.getComputedStyle(node);
    const family = style.fontFamily || node.getAttribute("font-family");
    if (!family) return;
    const font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${family}`;
    try {
      await document.fonts.load(font, node.textContent || "");
    } catch {
      // If a browser refuses the shorthand, the later timed measure still runs.
    }
  }));
  await document.fonts.ready;
}

const PlaquePreview = forwardRef<SVGSVGElement, Props>(({ state, activeStep, inscription }, ref) => {
  const [previewZoom, setPreviewZoom] = useState(100);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const woodExtra = state.wood ? 25 : 0;
  const totalW = state.width + woodExtra;
  const totalH = state.height + woodExtra;
  const offset = woodExtra / 2;

  // Helpers for geometry
  const cornerR = state.shape === Shape.Rect ? state.cornerRadius : 0;
  const isHeartPlaque = state.shape === Shape.Heart;
  const hasVisibleFixings = state.fixing === Fixing.Screws || state.fixing === Fixing.Caps;
  const isBrass = state.material.includes('brass');
  const isSteel = state.material.includes('stainless');
  const isOrbitalBrass = state.material === Material.OrbitalBrassMattLacquer;
  const materialFillId: Record<Material, string> = {
    [Material.BrushedBrass]: "brushedBrass",
    [Material.OrbitalBrassMattLacquer]: "orbitalBrass",
    [Material.PolishedBrass]: "polishedBrass",
    [Material.AgedBrass]: "agedBrass",
    [Material.BrushedSteel]: "brushedSteel",
    [Material.PolishedSteel]: "mirrorSteel",
  };
  const materialTextureId: Partial<Record<Material, string>> = {
    [Material.OrbitalBrassMattLacquer]: "orbitalBrassTexture",
    [Material.BrushedSteel]: "brushedSteelTexture",
    [Material.PolishedSteel]: "mirrorSteelTexture",
  };
  const fillUrl = `url(#${materialFillId[state.material]})`;
  const textureUrl = materialTextureId[state.material] ? `url(#${materialTextureId[state.material]})` : null;
  const textureOpacity = state.material === Material.BrushedSteel
    ? 0.74
    : state.material === Material.PolishedSteel
      ? 0.42
      : state.material === Material.OrbitalBrassMattLacquer
        ? 0.12
        : 0.24;
  const reverseMetalFillUrl = isBrass ? "url(#brushedBrass)" : "url(#mirrorSteel)";
  const engravedFill = TEXT_COLOR_VALUES[state.textColor];

  // For reverse etch: background is dark, text/border is metal
  const plateFill = state.reverseEtch ? engravedFill : fillUrl;

  // Calculations for holes/caps
  const isScallopedBorder = state.borderStyle === BorderStyle.Scalloped || state.borderStyle === BorderStyle.DoubleScalloped;
  const borderOuterInset = 3;
  const borderInnerInset = 5;
  const borderStrokeScale = state.width < 100 || state.height < 100 ? 0.5 : 1;
  const fixingBorderClearance = state.fixing === Fixing.Screws ? 0.75 : 2;
  const screwRadius = 2.5;
  const capRadius = state.capSize / 2;
  const fixingRadius = state.fixing === Fixing.Caps ? capRadius : screwRadius;
  const borderFixingInset = borderOuterInset;
  const holeInset = state.border
    ? borderFixingInset + fixingRadius + fixingBorderClearance
    : state.fixing === Fixing.Screws ? 7 : 10 + (state.capSize === 15 ? 2 : 0);
  const sideMountedFixings = state.shape !== Shape.Rect || state.height < 80;

  let holes: { x: number, y: number }[] = [];
  const cx = offset + state.width / 2;
  const cy = offset + state.height / 2;

  // Calculate fixing positions
  if (hasVisibleFixings && !isHeartPlaque) {
    if (!sideMountedFixings) {
      const x1 = offset + holeInset;
      const x2 = offset + state.width - holeInset;
      const y1 = offset + holeInset;
      const y2 = offset + state.height - holeInset;
      holes = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
    } else {
      const xOffset = state.width / 2 - holeInset;
      holes = [{ x: cx - xOffset, y: cy }, { x: cx + xOffset, y: cy }];
    }
  }

  // --- Auto-Scaling Text Logic ---
  const textGroupRef = useRef<SVGGElement>(null);
  const [textTransform, setTextTransform] = useState("");
  const artworkSvg = React.useMemo(
    () => state.memorialImageEnabled && state.memorialImageMethod === MemorialImageMethod.Engraved
      ? getSvgPayload(state.memorialImageSvg)
      : null,
    [state.memorialImageEnabled, state.memorialImageMethod, state.memorialImageSvg]
  );
  const uvPrintImageUrl = state.memorialImageEnabled && state.memorialImageMethod === MemorialImageMethod.UvPrinted
    ? state.memorialImageSourceUrl || state.memorialImagePreviewUrl
    : null;
  const renderedGeneratedSvgContent = React.useMemo(
    () => normalizeScriptTypography(state.generatedSvgContent),
    [state.generatedSvgContent]
  );

  const layout = React.useMemo(() => getInscriptionLayout(state, inscription, {
    unrestrictedArtwork: activeStep >= 5,
  }), [
    activeStep,
    inscription,
    state.height,
    state.memorialImageEnabled,
    state.memorialImagePlacement,
    state.memorialImageScale,
    state.safeMargin,
    state.shape,
    state.width,
    state.wood,
  ]);
  const artworkX = layout.artX + state.memorialImageOffsetX;
  const artworkY = layout.artY + state.memorialImageOffsetY;

  useLayoutEffect(() => {
    const measure = () => {
      if (textGroupRef.current) {
        try {
          const bbox = textGroupRef.current.getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            // Preserve glyph proportions while filling the inscription box.
            const scaleX = layout.textW / bbox.width;
            const scaleY = layout.textH / bbox.height;
            const scale = Math.min(scaleX, scaleY, 3.0) * Math.max(0.1, state.inscriptionScale);

            // Center the text block
            const centerOffsetX = -(bbox.x + bbox.width / 2);
            const centerOffsetY = -(bbox.y + bbox.height / 2);

            setTextTransform(`scale(${scale}) translate(${centerOffsetX}, ${centerOffsetY})`);
          }
        } catch (e) {
          console.warn("Text scaling failed", e);
        }
      }
    };

    // Measure immediately
    measure();

    // Re-measure after fonts load (Google Fonts load async)
    const timer = setTimeout(measure, 800);
    let cancelled = false;
    if (textGroupRef.current) {
      loadSvgTextFonts(textGroupRef.current).then(() => {
        if (!cancelled) requestAnimationFrame(measure);
      });
    }

    // Also try using the Font Loading API
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) requestAnimationFrame(measure);
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeStep, state.designStyle, state.generatedSvgContent, state.width, state.height, state.shape, state.safeMargin, state.memorialImageMethod, state.memorialImagePreviewUrl, state.memorialImageSourceUrl, state.memorialImageSvg, state.inscriptionScale, layout.textW, layout.textH]);


  // --- Border Path Logic ---
  const renderBorder = () => {
    if (!state.border) return null;
    // Reverse etch: border is raised metal. Normal: border is text color.
    const bColor = state.reverseEtch ? fillUrl : engravedFill;
    const bInset = borderOuterInset;
    const scallopR = fixingRadius + fixingBorderClearance;
    const strokeProps = {
      fill: "none",
      stroke: bColor,
      className: "engraved-border",
    };
    const scaleBorderStroke = (strokeWidth: number) => strokeWidth * borderStrokeScale;
    const renderStandardBorder = (inset: number, strokeWidth = 1, opacity = 1) => {
      const safeInset = Math.max(1, inset);
      if (state.shape === Shape.Rect) {
        return (
          <rect
            key={`rect-${safeInset}`}
            x={offset + safeInset}
            y={offset + safeInset}
            width={Math.max(1, state.width - safeInset * 2)}
            height={Math.max(1, state.height - safeInset * 2)}
            rx={Math.max(0, cornerR - 2)}
            strokeWidth={scaleBorderStroke(strokeWidth)}
            opacity={opacity}
            {...strokeProps}
          />
        );
      }
      if (state.shape === Shape.Heart) {
        return (
          <path
            key={`heart-${safeInset}`}
            d={heartPathD(offset, offset, state.width, state.height, safeInset)}
            strokeWidth={scaleBorderStroke(strokeWidth)}
            opacity={opacity}
            {...strokeProps}
          />
        );
      }
      return (
        <ellipse
          key={`ellipse-${safeInset}`}
          cx={cx}
          cy={cy}
          rx={Math.max(1, state.width / 2 - safeInset)}
          ry={Math.max(1, state.height / 2 - safeInset)}
          strokeWidth={scaleBorderStroke(strokeWidth)}
          opacity={opacity}
          {...strokeProps}
        />
      );
    };
    if (state.borderStyle === BorderStyle.Double) {
      return <g>{renderStandardBorder(borderOuterInset)}{renderStandardBorder(borderInnerInset, 0.75, 0.8)}</g>;
    }
    if (state.borderStyle === BorderStyle.Inset) {
      return <g>{renderStandardBorder(bInset + 3, 1.6)}{renderStandardBorder(bInset + 9, 0.55, 0.45)}</g>;
    }

    const renderScallopedBorder = (extraInset = 0, strokeWidth = 1, opacity = 1) => {
      const inset = bInset + extraInset;
      const radius = Math.max(1, scallopR - extraInset * 0.25);

      // 1. Rectangle with Scalloped Corners
      if (state.shape === Shape.Rect && holes.length === 4) {
        const [baseTl, baseTr, baseBr, baseBl] = holes;
        const tl = { x: baseTl.x + extraInset, y: baseTl.y + extraInset };
        const tr = { x: baseTr.x - extraInset, y: baseTr.y + extraInset };
        const br = { x: baseBr.x - extraInset, y: baseBr.y - extraInset };
        const bl = { x: baseBl.x + extraInset, y: baseBl.y - extraInset };
        const r = radius;
        const d = `
          M ${tl.x + r} ${tl.y}
          L ${tr.x - r} ${tr.y} A ${r} ${r} 0 0 0 ${tr.x} ${tr.y + r}
          L ${br.x} ${br.y - r} A ${r} ${r} 0 0 0 ${br.x - r} ${br.y}
          L ${bl.x + r} ${bl.y} A ${r} ${r} 0 0 0 ${bl.x} ${bl.y - r}
          L ${tl.x} ${tl.y + r} A ${r} ${r} 0 0 0 ${tl.x + r} ${tl.y} Z
        `;
        return <path key={`scallop-rect-${extraInset}`} d={d} strokeWidth={scaleBorderStroke(strokeWidth)} opacity={opacity} {...strokeProps} />;
      }

      // 2. Oval/circle with scalloped sides. The cap clearance is a real
      // circle around each cap, trimmed where it intersects the plaque ellipse.
      else if (state.shape !== Shape.Rect && holes.length === 2) {
        const [leftHole, rightHole] = holes[0].x < holes[1].x ? holes : [holes[1], holes[0]];
        const leftCenterlineInset = Math.max(inset, leftHole.x - offset + extraInset);
        const rightCenterlineInset = Math.max(inset, offset + state.width - rightHole.x + extraInset);
        const centerlineInset = Math.max(inset, (leftCenterlineInset + rightCenterlineInset) / 2);
        const rx = state.width / 2 - centerlineInset;
        const ry = state.height / 2 - centerlineInset;
        const intersectionY = getEllipseCircleIntersectionY(rx, ry, radius);
        const ellipseX = getEllipseXAtY(rx, ry, intersectionY);
        const leftTop = { x: cx - ellipseX, y: cy - intersectionY };
        const leftBottom = { x: cx - ellipseX, y: cy + intersectionY };
        const rightBottom = { x: cx + ellipseX, y: cy + intersectionY };
        const rightTop = { x: cx + ellipseX, y: cy - intersectionY };

        let d = `M ${rightTop.x} ${rightTop.y}`;
        d += ` A ${rx} ${ry} 0 0 0 ${leftTop.x} ${leftTop.y}`;
        d += ` A ${radius} ${radius} 0 0 1 ${leftBottom.x} ${leftBottom.y}`;
        d += ` A ${rx} ${ry} 0 0 0 ${rightBottom.x} ${rightBottom.y}`;
        d += ` A ${radius} ${radius} 0 0 1 ${rightTop.x} ${rightTop.y}`;
        d += ` Z`;

        return <path key={`scallop-oval-${extraInset}`} d={d} strokeWidth={scaleBorderStroke(strokeWidth)} opacity={opacity} {...strokeProps} />;
      }

      return renderStandardBorder(inset, strokeWidth, opacity);
    };

    if (isScallopedBorder && holes.length > 0) {
      if (state.borderStyle === BorderStyle.DoubleScalloped) {
        return <g>{renderScallopedBorder(0, 0.75)}{renderScallopedBorder(borderInnerInset - borderOuterInset, 0.5, 0.75)}</g>;
      }
      return renderScallopedBorder();
    }

    // STANDARD BORDER (No Caps or VHB)
    if (state.shape === Shape.Rect) {
      return (
        <rect
          x={offset + bInset} y={offset + bInset}
          width={state.width - bInset * 2}
          height={state.height - bInset * 2}
          rx={Math.max(0, cornerR - 2)}
          fill="none" stroke={bColor} strokeWidth={scaleBorderStroke(1)}
          className="engraved-border"
        />
      );
    } else if (state.shape === Shape.Heart) {
      return (
        <path
          d={heartPathD(offset, offset, state.width, state.height, bInset)}
          fill="none" stroke={bColor} strokeWidth={scaleBorderStroke(1)}
          className="engraved-border"
        />
      );
    } else {
      return (
        <ellipse
          cx={cx} cy={cy}
          rx={state.width / 2 - bInset}
          ry={state.height / 2 - bInset}
          fill="none" stroke={bColor} strokeWidth={scaleBorderStroke(1)}
          className="engraved-border"
        />
      );
    }
  };

  const sizePromptContent = `
    <g>
      <text y="-28" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="26" letter-spacing="0.08em" fill="#2b1d0e">CHOOSE YOUR</text>
      <path d="M -54 -18 L 54 -18" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="10" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="24" letter-spacing="0.08em" fill="#2b1d0e">
        <tspan x="0" dy="0">SIZE AND SHAPE</tspan>
      </text>
      <text y="39" text-anchor="middle" font-family="Lato" font-weight="400" font-size="10" letter-spacing="0.08em" fill="#4a3c2a">
        <tspan x="0" dy="0">OR START WITH A</tspan>
        <tspan x="0" dy="14">STANDARD PRESET</tspan>
      </text>
    </g>
  `;
  const materialPromptContent = `
    <g>
      <text y="-32" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="19" letter-spacing="0.08em" fill="#2b1d0e">CHOOSE MATERIAL</text>
      <path d="M -68 -24 L 68 -24" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="2" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="17" letter-spacing="0.07em" fill="#2b1d0e">
        <tspan x="0" dy="0">BRASS OR STEEL</tspan>
        <tspan x="0" dy="24">FINISH</tspan>
      </text>
    </g>
  `;
  const colourPromptContent = `
    <g>
      <text y="-32" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="22" letter-spacing="0.08em" fill="#2b1d0e">CHOOSE COLOUR</text>
      <path d="M -62 -20 L 62 -20" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="8" text-anchor="middle" font-family="Lato" font-weight="700" font-size="10" letter-spacing="0.08em" fill="#4a3c2a">
        <tspan x="0" dy="0">SET THE ENGRAVING</tspan>
        <tspan x="0" dy="15">AND TEXT CONTRAST</tspan>
      </text>
    </g>
  `;
  const fixingsPromptContent = `
    <g>
      <text y="-34" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="18" letter-spacing="0.08em" fill="#2b1d0e">FIXINGS AND BORDER</text>
      <text y="-7" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="18" letter-spacing="0.08em" fill="#2b1d0e">CHOOSE MOUNTING</text>
      <path d="M -62 10 L 62 10" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="29" text-anchor="middle" font-family="Lato" font-weight="700" font-size="9.5" letter-spacing="0.08em" fill="#4a3c2a">
        <tspan x="0" dy="0">SELECT BORDER STYLE</tspan>
        <tspan x="0" dy="13">AND HARDWARE</tspan>
      </text>
    </g>
  `;
  const woodPromptContent = `
    <g>
      <text y="-34" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="23" letter-spacing="0.08em" fill="#2b1d0e">WOOD BACKING</text>
      <path d="M -58 -23 L 58 -23" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="2" text-anchor="middle" font-family="Lato" font-weight="700" font-size="10.5" letter-spacing="0.08em" fill="#4a3c2a">
        <tspan x="0" dy="0">OPTIONAL TIMBER BOARD</tspan>
        <tspan x="0" dy="15">WITH EDGE FINISH</tspan>
      </text>
    </g>
  `;
  const wordsTypography = WORDS_DRAFT_TYPOGRAPHY[state.designStyle];
  const wordsPromptContent = `
    <g>
      <text y="-42" text-anchor="middle" font-family="${wordsTypography.titleFont}" font-weight="${wordsTypography.titleWeight}" font-size="19" letter-spacing="${wordsTypography.titleSpacing}" fill="#2b1d0e">
        <tspan x="0" dy="0">CHOOSE YOUR</tspan>
        <tspan x="0" dy="23">TEXT AND LAYOUT</tspan>
      </text>
      <path d="M -66 -8 L 66 -8" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="13" text-anchor="middle" font-family="${wordsTypography.titleFont}" font-weight="${wordsTypography.titleWeight}" font-size="13" letter-spacing="${wordsTypography.titleSpacing}" fill="#2b1d0e">ENTER YOUR TEXT</text>
      <text y="35" text-anchor="middle" font-family="${wordsTypography.bodyFont}" font-weight="700" font-size="8.5" letter-spacing="${wordsTypography.bodySpacing}" fill="#4a3c2a">
        <tspan x="0" dy="0">OUR LAYOUT ASSISTANT</tspan>
        <tspan x="0" dy="13">WILL TAKE CARE OF THE REST</tspan>
      </text>
    </g>
  `;
  const proofPromptContent = `
    <g>
      <text y="-36" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="22" letter-spacing="0.08em" fill="#2b1d0e">REVIEW PROOF</text>
      <path d="M -58 -24 L 58 -24" stroke="#2b1d0e" stroke-width="0.5" opacity="0.4"/>
      <text y="1" text-anchor="middle" font-family="Lato" font-weight="700" font-size="10.5" letter-spacing="0.08em" fill="#4a3c2a">
        <tspan x="0" dy="0">GENERATE YOUR TEXT</tspan>
        <tspan x="0" dy="15">THEN CHECK THE FINAL LAYOUT</tspan>
      </text>
      <text y="40" text-anchor="middle" font-family="Lato" font-weight="700" font-size="8.2" letter-spacing="0.1em" fill="#4a3c2a" opacity="0.78">SAVE OR ADD TO BASKET WHEN READY</text>
    </g>
  `;
  const promptContentByStep: Record<number, string> = {
    0: materialPromptContent,
    1: sizePromptContent,
    2: colourPromptContent,
    3: fixingsPromptContent,
    4: woodPromptContent,
    5: wordsPromptContent,
    6: proofPromptContent,
  };
  const defaultContent = promptContentByStep[activeStep] || sizePromptContent;
  const updatePreviewZoom = (nextZoom: number) => {
    setPreviewZoom(Math.max(75, Math.min(200, nextZoom)));
  };
  const centerPreviewViewport = () => {
    window.requestAnimationFrame(() => {
      const viewport = previewViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({
        left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
        top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
        behavior: 'smooth',
      });
    });
  };
  const resetPreviewView = () => {
    setPreviewZoom(100);
    centerPreviewViewport();
  };

  return (
    <div className="print-content proof-canvas relative flex aspect-[4/3] max-h-[58vh] w-full min-w-0 flex-col gap-2 overflow-hidden rounded-lg border p-3 md:aspect-video md:max-h-none md:p-5">
      {/* Background grid pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#d9b45f 1px, transparent 1px), linear-gradient(90deg, #d9b45f 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div className="no-print absolute right-3 top-3 z-20 hidden flex-wrap items-center justify-end gap-1 text-[11px] font-black text-[#9a6a16] md:flex">
        <button
          type="button"
          onClick={() => updatePreviewZoom(previewZoom - 25)}
          className="h-8 w-8 rounded-full border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0]/95 text-base leading-none shadow-sm transition hover:bg-[#efe4d1]"
          aria-label="Zoom out preview"
        >
          -
        </button>
        <span
          className="flex h-8 min-w-[52px] items-center justify-center rounded-full border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0]/95 px-3 shadow-sm"
          aria-label={`Preview zoom ${previewZoom}%`}
        >
          {previewZoom}%
        </span>
        <button
          type="button"
          onClick={() => updatePreviewZoom(previewZoom + 25)}
          className="h-8 w-8 rounded-full border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0]/95 text-base leading-none shadow-sm transition hover:bg-[#efe4d1]"
          aria-label="Zoom in preview"
        >
          +
        </button>
        <button
          type="button"
          onClick={resetPreviewView}
          className="h-8 rounded-full border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0]/95 px-3 shadow-sm transition hover:bg-[#efe4d1] disabled:opacity-60"
          aria-label="Reset preview to default view"
          disabled={previewZoom === 100}
        >
          Reset view
        </button>
      </div>

      <div ref={previewViewportRef} className="proof-preview-viewport relative z-10 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] md:overflow-auto">
        <div
          className="proof-preview-scale mx-auto flex h-full min-w-0 shrink items-center justify-center transition-[width,height] duration-200 md:shrink-0"
          style={{
            width: `max(1px, calc(${previewZoom}% - var(--preview-gutter, 0px)))`,
            height: `max(1px, calc(${previewZoom}% - var(--preview-gutter, 0px)))`,
          }}
        >
          <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${totalW} ${totalH}`}
            preserveAspectRatio="xMidYMid meet"
            overflow="visible"
            className="h-full max-h-full w-full max-w-full transition-all duration-300"
          >
        <defs>
          <linearGradient id="brushedBrass" x1="0" y1="0" x2="1" y2="0.08">
            <stop offset="0%" stopColor="#9f6e20" />
            <stop offset="22%" stopColor="#b98734" />
            <stop offset="48%" stopColor="#c89b48" />
            <stop offset="72%" stopColor="#b17b27" />
            <stop offset="100%" stopColor="#8b5d18" />
          </linearGradient>

          <linearGradient id="polishedBrass" x1="0" y1="0" x2="1" y2="0.24">
            <stop offset="0%" stopColor="#7d4a09" />
            <stop offset="12%" stopColor="#f2bf37" />
            <stop offset="25%" stopColor="#fff0a6" />
            <stop offset="34%" stopColor="#b66c0c" />
            <stop offset="49%" stopColor="#fff8c9" />
            <stop offset="57%" stopColor="#c77912" />
            <stop offset="72%" stopColor="#edc34b" />
            <stop offset="100%" stopColor="#6f3f08" />
          </linearGradient>

          <linearGradient id="agedBrass" x1="0" y1="0" x2="1" y2="0.2">
            <stop offset="0%" stopColor="#4f3a20" />
            <stop offset="22%" stopColor="#8f7334" />
            <stop offset="44%" stopColor="#c0a45a" />
            <stop offset="63%" stopColor="#6d5327" />
            <stop offset="82%" stopColor="#b49348" />
            <stop offset="100%" stopColor="#382817" />
          </linearGradient>

          <radialGradient id="orbitalBrass" cx="42%" cy="38%" r="78%">
            <stop offset="0%" stopColor="#e7d398" />
            <stop offset="24%" stopColor="#c1a363" />
            <stop offset="50%" stopColor="#9c824a" />
            <stop offset="72%" stopColor="#d2bb78" />
            <stop offset="100%" stopColor="#816939" />
          </radialGradient>

          <linearGradient id="brushedSteel" x1="0" y1="0" x2="1" y2="0.08">
            <stop offset="0%" stopColor="#7a858b" />
            <stop offset="24%" stopColor="#aeb8be" />
            <stop offset="50%" stopColor="#c7d0d4" />
            <stop offset="74%" stopColor="#9ba7ae" />
            <stop offset="100%" stopColor="#68727a" />
          </linearGradient>

          <linearGradient id="mirrorSteel" x1="0" y1="0" x2="1" y2="0.22">
            <stop offset="0%" stopColor="#4a535b" />
            <stop offset="15%" stopColor="#d7dde1" />
            <stop offset="26%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#8c969e" />
            <stop offset="55%" stopColor="#f2f6f8" />
            <stop offset="72%" stopColor="#727d86" />
            <stop offset="100%" stopColor="#39434b" />
          </linearGradient>

          <linearGradient id="screwMetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e5e7eb" />
            <stop offset="0.5" stopColor="#9ca3af" />
            <stop offset="1" stopColor="#4b5563" />
          </linearGradient>

          <linearGradient id="woodDark" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5c3a1e" />
            <stop offset="0.5" stopColor="#6b4323" />
            <stop offset="1" stopColor="#2c180b" />
          </linearGradient>
          <linearGradient id="woodLight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d4a373" />
            <stop offset="0.5" stopColor="#faedcd" />
            <stop offset="1" stopColor="#a98467" />
          </linearGradient>
          <pattern id="woodDarkTexture" x="0" y="0" width={totalW} height={totalH} patternUnits="userSpaceOnUse">
            <image href="/materials/wood-dark-mahogany-veneer.webp" x="0" y="0" width={totalW} height={totalH} preserveAspectRatio="none" />
          </pattern>
          <pattern id="woodLightTexture" x="0" y="0" width={totalW} height={totalH} patternUnits="userSpaceOnUse">
            <image href="/materials/wood-light-oak-veneer.webp" x="0" y="0" width={totalW} height={totalH} preserveAspectRatio="none" />
          </pattern>

          <pattern id="brushedBrassTexture" x={offset} y={offset} width={state.width} height={state.height} patternUnits="userSpaceOnUse">
            <image href="/materials/brushed-brass-satin.png" x="0" y="0" width={state.width} height={state.height} preserveAspectRatio="none" />
          </pattern>
          <pattern id="orbitalBrassTexture" x={offset} y={offset} width={state.width} height={state.height} patternUnits="userSpaceOnUse">
            <image href="/materials/orbital-brass-matt.png" x="0" y="0" width={state.width} height={state.height} preserveAspectRatio="none" />
          </pattern>
          <pattern id="brushedSteelTexture" x={offset} y={offset} width={state.width} height={state.height} patternUnits="userSpaceOnUse">
            <image href="/materials/brushed-stainless-satin.png" x="0" y="0" width={state.width} height={state.height} preserveAspectRatio="none" />
          </pattern>
          <pattern id="mirrorSteelTexture" x={offset} y={offset} width={state.width} height={state.height} patternUnits="userSpaceOnUse">
            <image href="/materials/mirror-stainless.png" x="0" y="0" width={state.width} height={state.height} preserveAspectRatio="none" />
          </pattern>

          {/* Brushed Metal Texture */}
          <filter id="brushedTexture" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.8" numOctaves="2" result="noise" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer result="grain">
              <feFuncA type="linear" slope="0.08" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="grain" mode="overlay" />
          </filter>

          <pattern id="satinBrushGrain" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
            <path d="M0 0.35 H2.4 M0 0.82 H2.4 M0 1.34 H2.4 M0 1.96 H2.4" stroke="#ffe7a4" strokeWidth="0.045" opacity="0.22" />
            <path d="M0 0.58 H2.4 M0 1.12 H2.4 M0 1.68 H2.4 M0 2.22 H2.4" stroke="#4f310b" strokeWidth="0.04" opacity="0.18" />
          </pattern>

          <pattern id="stainlessBrushGrain" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
            <path d="M0 0.32 H2.4 M0 0.86 H2.4 M0 1.42 H2.4 M0 2.02 H2.4" stroke="#ffffff" strokeWidth="0.045" opacity="0.22" />
            <path d="M0 0.58 H2.4 M0 1.14 H2.4 M0 1.72 H2.4 M0 2.24 H2.4" stroke="#364148" strokeWidth="0.04" opacity="0.17" />
          </pattern>

          <pattern id="satinScuffs" width="34" height="11" patternUnits="userSpaceOnUse">
            <path d="M2 2.2 H13 M18 3.1 H31 M5 6.4 H21 M24 8.6 H33" stroke="#fff6ca" strokeWidth="0.08" opacity="0.18" />
            <path d="M1 4.7 H8 M12 7.5 H28 M3 9.6 H17" stroke="#4f3411" strokeWidth="0.07" opacity="0.10" />
          </pattern>

          <pattern id="stainlessScuffs" width="34" height="11" patternUnits="userSpaceOnUse">
            <path d="M2 2.2 H13 M18 3.1 H31 M5 6.4 H21 M24 8.6 H33" stroke="#ffffff" strokeWidth="0.08" opacity="0.16" />
            <path d="M1 4.7 H8 M12 7.5 H28 M3 9.6 H17" stroke="#2d3941" strokeWidth="0.07" opacity="0.10" />
          </pattern>

          <pattern id="orbitalSwirl" width="5.6" height="5.6" patternUnits="userSpaceOnUse">
            <path d="M0.5 2.7 Q2.5 1.2 5.1 2.4" fill="none" stroke="#fff4c2" strokeWidth="0.11" opacity="0.20" />
            <path d="M0.2 4.2 Q2.4 3.0 5.2 3.8" fill="none" stroke="#5d4b2b" strokeWidth="0.09" opacity="0.13" />
            <path d="M1.0 1.0 Q2.8 0.1 4.8 0.9" fill="none" stroke="#fff9dd" strokeWidth="0.08" opacity="0.16" />
            <circle cx="4.8" cy="4.7" r="1.4" fill="none" stroke="#4d3f25" strokeWidth="0.07" opacity="0.08" />
          </pattern>

          <pattern id="mirrorReflectionBands" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(10)">
            <rect x="0" y="4" width="72" height="12" fill="#ffffff" opacity="0.18" />
            <rect x="0" y="18" width="72" height="10" fill="#23303a" opacity="0.12" />
            <rect x="0" y="44" width="72" height="8" fill="#ffffff" opacity="0.12" />
          </pattern>

          {/* Subtle noise for aged look */}
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope="0.1" /></feComponentTransfer>
          </filter>

          {/* Engraved text effect */}
          <filter id="engraved" x="-5%" y="-5%" width="110%" height="110%">
            <feOffset dx="0.3" dy="0.3" result="shadow" />
            <feGaussianBlur in="shadow" stdDeviation="0.2" />
            <feComposite in="SourceGraphic" operator="over" />
          </filter>
        </defs>

        {/* Wood Backing - Added class for export targeting */}
        {state.wood && (
          <g className="wood-backing">
            {state.shape === Shape.Rect ? (
              <>
                <rect
                  x={0} y={0} width={totalW} height={totalH} rx={0} ry={0}
                  fill={state.woodTone === 'dark' ? "url(#woodDarkTexture)" : "url(#woodLightTexture)"}
                />
              </>
            ) : state.shape === Shape.Heart ? (
              <>
                <path
                  d={heartPathD(0, 0, totalW, totalH)}
                  fill={state.woodTone === 'dark' ? "url(#woodDarkTexture)" : "url(#woodLightTexture)"}
                />
              </>
            ) : (
              <>
                <ellipse
                  cx={totalW / 2} cy={totalH / 2}
                  rx={totalW / 2} ry={totalH / 2}
                  fill={state.woodTone === 'dark' ? "url(#woodDarkTexture)" : "url(#woodLightTexture)"}
                />
              </>
            )}
          </g>
        )}

        {/* Main Plaque Group */}
        <g id="plate-group">
          {/* Main Shape (Cut Line) */}
          {state.shape === Shape.Rect ? (
            <rect
              x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
              fill={plateFill} stroke={isSteel ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.42)"} strokeWidth={0.5}
              className="cut-line"
            />
          ) : state.shape === Shape.Heart ? (
            <path
              d={heartPathD(offset, offset, state.width, state.height)}
              fill={plateFill} stroke={isSteel ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.42)"} strokeWidth={0.5}
              className="cut-line"
            />
          ) : (
            <ellipse
              cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
              fill={plateFill} stroke={isSteel ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.42)"} strokeWidth={0.5}
              className="cut-line"
            />
          )}

          {/* Texture Overlay */}
          {((state.material.includes('brushed') && state.material !== Material.BrushedSteel) || state.material.includes('aged')) && (
            state.shape === Shape.Rect ? (
              <rect x={offset} y={offset} width={state.width} height={state.height} rx={cornerR} fill="transparent" filter="url(#noise)" className="visual-effect" />
            ) : state.shape === Shape.Heart ? (
              <path d={heartPathD(offset, offset, state.width, state.height)} fill="transparent" filter="url(#noise)" className="visual-effect" />
            ) : (
              <ellipse cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2} fill="transparent" filter="url(#noise)" className="visual-effect" />
            )
          )}

          {textureUrl && (
            state.shape === Shape.Rect ? (
              <rect
                x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                fill={textureUrl} opacity={textureOpacity}
                className="visual-effect"
              />
            ) : state.shape === Shape.Heart ? (
              <path
                d={heartPathD(offset, offset, state.width, state.height)}
                fill={textureUrl} opacity={textureOpacity}
                className="visual-effect"
              />
            ) : (
              <ellipse
                cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                fill={textureUrl} opacity={textureOpacity}
                className="visual-effect"
              />
            )
          )}

          {state.material === Material.BrushedBrass && (
            <g className="visual-effect" style={{ mixBlendMode: 'soft-light' }}>
              {state.shape === Shape.Rect ? (
                <>
                  <rect
                    x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                    fill="url(#satinBrushGrain)"
                    opacity={0.08}
                  />
                  <rect
                    x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                    fill="url(#satinScuffs)"
                    opacity={0.04}
                  />
                </>
              ) : state.shape === Shape.Heart ? (
                <>
                  <path
                    d={heartPathD(offset, offset, state.width, state.height)}
                    fill="url(#satinBrushGrain)"
                    opacity={0.08}
                  />
                  <path
                    d={heartPathD(offset, offset, state.width, state.height)}
                    fill="url(#satinScuffs)"
                    opacity={0.04}
                  />
                </>
              ) : (
                <>
                  <ellipse
                    cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                    fill="url(#satinBrushGrain)"
                    opacity={0.08}
                  />
                  <ellipse
                    cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                    fill="url(#satinScuffs)"
                    opacity={0.04}
                  />
                </>
              )}
            </g>
          )}

          {isOrbitalBrass && (
            state.shape === Shape.Rect ? (
              <rect
                x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                fill="url(#orbitalSwirl)" opacity={0.12} style={{ mixBlendMode: 'soft-light' }}
                className="visual-effect"
              />
            ) : state.shape === Shape.Heart ? (
              <path
                d={heartPathD(offset, offset, state.width, state.height)}
                fill="url(#orbitalSwirl)" opacity={0.12} style={{ mixBlendMode: 'soft-light' }}
                className="visual-effect"
              />
            ) : (
              <ellipse
                cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                fill="url(#orbitalSwirl)" opacity={0.12} style={{ mixBlendMode: 'soft-light' }}
                className="visual-effect"
              />
            )
          )}

          {state.material === Material.PolishedSteel && (
            state.shape === Shape.Rect ? (
              <rect
                x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                fill="url(#mirrorReflectionBands)" opacity={0.16} style={{ mixBlendMode: 'screen' }}
                className="visual-effect"
              />
            ) : state.shape === Shape.Heart ? (
              <path
                d={heartPathD(offset, offset, state.width, state.height)}
                fill="url(#mirrorReflectionBands)" opacity={0.16} style={{ mixBlendMode: 'screen' }}
                className="visual-effect"
              />
            ) : (
              <ellipse
                cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                fill="url(#mirrorReflectionBands)" opacity={0.16} style={{ mixBlendMode: 'screen' }}
                className="visual-effect"
              />
            )
          )}

          {/* Aged Patina Overlay */}
          {state.material === Material.AgedBrass && (
            state.shape === Shape.Rect ? (
              <rect
                x={offset} y={offset} width={state.width} height={state.height} rx={cornerR}
                fill="#2b1d0e" opacity={state.ageIntensity * 0.9} style={{ mixBlendMode: 'multiply' }}
                className="visual-effect"
              />
            ) : state.shape === Shape.Heart ? (
              <path
                d={heartPathD(offset, offset, state.width, state.height)}
                fill="#2b1d0e" opacity={state.ageIntensity * 0.9} style={{ mixBlendMode: 'multiply' }}
                className="visual-effect"
              />
            ) : (
              <ellipse
                cx={cx} cy={cy} rx={state.width / 2} ry={state.height / 2}
                fill="#2b1d0e" opacity={state.ageIntensity * 0.9} style={{ mixBlendMode: 'multiply' }}
                className="visual-effect"
              />
            )
          )}

          {/* Border */}
          <g id="border-layer">{renderBorder()}</g>

          {/* Memorial Artwork Layer */}
          {state.memorialImageEnabled && (
            <g
              id="memorial-artwork-layer"
              className={state.reverseEtch ? `text-content-metal${isBrass ? '' : ' steel'}` : "text-content"}
              style={{
                '--text-color': state.reverseEtch ? undefined : engravedFill,
                '--metal-fill': state.reverseEtch ? reverseMetalFillUrl : undefined,
                color: state.reverseEtch ? undefined : engravedFill,
              } as React.CSSProperties}
              fill={state.reverseEtch ? reverseMetalFillUrl : engravedFill}
            >
              {uvPrintImageUrl ? (
                <svg
                  x={artworkX}
                  y={artworkY}
                  width={layout.artW}
                  height={layout.artH}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="xMidYMid meet"
                  overflow="hidden"
                  className="uv-print-artwork"
                >
                  <defs>
                    <clipPath id="uv-portrait-shape">
                      {portraitShapeClip(state.memorialImageShape)}
                    </clipPath>
                  </defs>
                  <image
                    href={uvPrintImageUrl}
                    x={(100 - 100 * state.memorialImageZoom) / 2}
                    y={(100 - 100 * state.memorialImageZoom) / 2}
                    width={100 * state.memorialImageZoom}
                    height={100 * state.memorialImageZoom}
                    preserveAspectRatio="xMidYMid meet"
                    clipPath="url(#uv-portrait-shape)"
                  />
                </svg>
              ) : artworkSvg ? (
                (() => {
                  const box = getViewBoxCenter(artworkSvg.viewBox);
                  return (
                    <svg
                      x={artworkX}
                      y={artworkY}
                      width={layout.artW}
                      height={layout.artH}
                      viewBox={artworkSvg.viewBox}
                      preserveAspectRatio="xMidYMid meet"
                      overflow="hidden"
                    >
                      <g transform={`translate(${box.cx} ${box.cy}) scale(${state.memorialImageZoom}) translate(${-box.cx} ${-box.cy})`} dangerouslySetInnerHTML={{ __html: artworkSvg.content }} />
                    </svg>
                  );
                })()
              ) : (
                <g
                  className="portrait-placeholder"
                  transform={`translate(${artworkX + layout.artW / 2}, ${artworkY + layout.artH / 2})`}
                  fill="none"
                  stroke={state.reverseEtch ? reverseMetalFillUrl : engravedFill}
                  strokeWidth={Math.max(0.8, Math.min(layout.artW, layout.artH) * 0.018)}
                  opacity={0.42}
                >
                  <ellipse rx={layout.artW * 0.28} ry={layout.artH * 0.28} />
                  <path d={`M ${-layout.artW * 0.42} ${layout.artH * 0.42} Q 0 ${layout.artH * 0.04} ${layout.artW * 0.42} ${layout.artH * 0.42}`} />
                </g>
              )}
            </g>
          )}

          {/* Text Layer (AI Generated or Default) */}
          <g transform={`translate(${layout.textCx + state.inscriptionOffsetX}, ${layout.textCy + state.inscriptionOffsetY})`}>
            <g
              id="ai-text-layer"
              ref={textGroupRef}
              data-fit-width={layout.textW}
              data-fit-height={layout.textH}
              data-fit-scale={state.inscriptionScale}
              transform={textTransform}
              className={state.reverseEtch ? `text-content-metal${isBrass ? '' : ' steel'}` : "text-content"}
              style={{
                '--text-color': state.reverseEtch ? undefined : engravedFill,
                '--metal-fill': state.reverseEtch ? reverseMetalFillUrl : undefined,
                color: state.reverseEtch ? undefined : engravedFill
              } as React.CSSProperties}
              fill={state.reverseEtch ? reverseMetalFillUrl : engravedFill}
              dangerouslySetInnerHTML={{ __html: renderedGeneratedSvgContent || defaultContent }}
            />
          </g>
        </g>

        {/* Fixings (Top Layer) */}
        <g id="fixings-layer">
          {holes.map((h, i) => (
            <g key={i}>
              {state.fixing === Fixing.Caps ? (
                <g className="fixing cap">
                  {/* Cap Body - matches material */}
                  <circle cx={h.x} cy={h.y} r={capRadius} fill={fillUrl} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />

                  {/* Patina for Aged Brass Caps */}
                  {state.material === Material.AgedBrass && (
                    <circle cx={h.x} cy={h.y} r={capRadius} fill="#2b1d0e" opacity={state.ageIntensity * 0.9} style={{ mixBlendMode: 'multiply' }} className="visual-effect" />
                  )}

                  {/* Subtle flat highlight instead of dome */}
                  <circle cx={h.x} cy={h.y} r={capRadius * 0.8} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} className="visual-effect" />
                </g>
              ) : (
                <g className="fixing hole">
                  {/* Countersunk screws are colour-matched to the selected plaque material. */}
                  <circle cx={h.x} cy={h.y} r={screwRadius} fill={fillUrl} stroke="rgba(0,0,0,0.45)" strokeWidth={0.5} />
                  {state.material === Material.AgedBrass && (
                    <circle cx={h.x} cy={h.y} r={screwRadius} fill="#2b1d0e" opacity={state.ageIntensity * 0.9} style={{ mixBlendMode: 'multiply' }} className="visual-effect" />
                  )}
                  {/* Phillips Cross */}
                  <path
                    d={`M${h.x - screwRadius * 0.45},${h.y} L${h.x + screwRadius * 0.45},${h.y} M${h.x},${h.y - screwRadius * 0.45} L${h.x},${h.y + screwRadius * 0.45}`}
                    stroke="#333" strokeWidth={Math.max(0.8, screwRadius * 0.32)} strokeLinecap="round"
                  />
                  {/* Inner shadow for depth */}
                  <circle cx={h.x} cy={h.y} r={screwRadius} fill="url(#noise)" opacity={0.3} style={{ mixBlendMode: 'multiply' }} />
                </g>
              )}
            </g>
          ))}
        </g>
          </svg>
        </div>
      </div>
    </div>
  );
});

PlaquePreview.displayName = 'PlaquePreview';
export default PlaquePreview;
