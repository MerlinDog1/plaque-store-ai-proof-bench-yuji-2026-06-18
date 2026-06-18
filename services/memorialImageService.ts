import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import {
  EtchmasterImageMode,
  EtchmasterImageModel,
  EtchmasterImagePreset,
  EtchmasterShapeEdge,
  EtchmasterShapeMask,
  MemorialImagePlacement,
  MemorialImageShape,
  Shape,
} from "../types";
import { getSafeMarginMm } from "./safeMargin";
import { getGeminiClient } from "./geminiClient";

const MODEL = "gemini-3.1-flash-image-preview";
const IMAGE_GENERATION_TIMEOUT_MS = 8 * 60 * 1000;
const IMAGE_GENERATION_SIZE = "4K";

const getAIClient = getGeminiClient;

const retryWrapper = async <T>(
  operation: () => Promise<T>,
  retries = 3,
  baseDelay = 1800
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const msg = String(error?.message || error || "").toLowerCase();
    const retryable =
      error?.status === 503 ||
      error?.status === 500 ||
      error?.code === 503 ||
      error?.code === 500 ||
      msg.includes("503") ||
      msg.includes("500") ||
      msg.includes("overloaded") ||
      msg.includes("internal error") ||
      msg.includes('"status":"internal"') ||
      msg.includes('"code":500') ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("deadline") ||
      msg.includes("network");
    if (retries > 0 && retryable) {
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      return retryWrapper(operation, retries - 1, baseDelay * 1.5);
    }
    throw error;
  }
};

async function resizeImageBase64(data: string, mimeType: string, maxDim = 1400): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) return resolve(data);
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(data);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(mimeType, 0.92).split(",")[1]);
    };
    img.onerror = () => resolve(data);
    img.src = `data:${mimeType};base64,${data}`;
  });
}

function extractImageOrThrow(response: any): string {
  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error("No image returned by Gemini.");

  let textResponse = "";
  for (const part of candidate.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    if (part.text) textResponse += `${part.text}\n`;
  }

  if (textResponse.trim()) {
    throw new Error(`Gemini returned text instead of artwork: ${textResponse.trim()}`);
  }
  throw new Error("No image data found in Gemini response.");
}

const styleInstructions: Record<EtchmasterImagePreset, string> = {
  [EtchmasterImagePreset.None]: "",
  [EtchmasterImagePreset.Etching]: "Traditional acid etching style, fine cross-hatching, deep bitten lines, pure black ink on white background, highly detailed intaglio printmaking look.",
  [EtchmasterImagePreset.Engraving]: "Classical burin engraving style, clean swelling and tapering lines, precise parallel hatching, banknote style, pure black and white.",
  [EtchmasterImagePreset.LineArt]: "Crisp, clean vector-style line art, uniform line weight, minimalist, pure black lines on pure white background, no shading.",
  [EtchmasterImagePreset.Manga]: "High-contrast manga style, pure black ink, screentone patterns for shading, dynamic inking, pure black and white.",
  [EtchmasterImagePreset.ScratchBoard]: "Scratchboard illustration style, white lines scraped out of a solid black background, high contrast, dramatic lighting, pure black and white.",
  [EtchmasterImagePreset.Woodcut]: "Bold woodcut print style, thick jagged lines, high contrast, gouged textures, pure black and white.",
  [EtchmasterImagePreset.Stippling]: "Stippling art style, shaded entirely with pure black dots of varying density, no drawn lines, pure black and white.",
  [EtchmasterImagePreset.Halftone]: "Retro halftone print style, pure black dots varying in size to create gradients, clean print texture, pure black and white.",
  [EtchmasterImagePreset.Hatching]: "Strict black and white hatching techniques, parallel and cross-hatched linework only where useful, no gray pixels.",
  [EtchmasterImagePreset.Linocut]: "Bold black and white linocut print style with carved shapes, confident edges and clean negative space.",
};

function getShapeMaskInstruction(mask: EtchmasterShapeMask, edge: EtchmasterShapeEdge) {
  if (mask === EtchmasterShapeMask.None) return "";
  if (mask === EtchmasterShapeMask.Heart && edge === EtchmasterShapeEdge.Vignette) {
    return [
      "The entire artwork must read unmistakably as a classic upright heart: rounded lobes, clear top notch, and defined lower point.",
      "The background outside the heart must be pure white.",
      "Do not erase the heart interior to empty white. Keep the source background where it helps, or add a subtle etched tonal field, stipple, hatching, or soft shadow inside the heart so the full heart silhouette is visible even where the subject does not fill it.",
      "Use a soft feathered heart edge with enough black engraving marks near the edge to reveal the heart shape, but no hard border line.",
      "Keep all important subject detail well inside the heart: faces, ears, paws, shoulders, and body outline must not touch or be clipped by the lobes, notch, sides, or lower point.",
      "Scale the subject down and centre it within the heart if needed; the heart shape must frame the subject rather than cutting through it.",
    ].join(" ");
  }
  const edgeInstruction =
    edge === EtchmasterShapeEdge.Outline
      ? `Draw a distinct black outline defining the ${mask}, and keep all artwork strictly inside it.`
      : edge === EtchmasterShapeEdge.Vignette
        ? `Let the artwork fade softly and gradually into the white background as a ${mask} vignette, with no hard border.`
        : `Make the artwork form a sharp, crisp ${mask} silhouette against the pure white background.`;
  return `The entire artwork must be confined within a perfect ${mask}. The background outside that ${mask} must be pure white. ${edgeInstruction}`;
}

export async function enhanceEtchingPrompt(prompt: string): Promise<string> {
  const ai = getAIClient();
  const response = await retryWrapper(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert prompt engineer for black and white chemical etching artwork.
Enhance this prompt so the output is strictly black and white, high contrast, pure white background, and suitable for vector tracing into metal etching.
Keep the user's subject and intent. Do not add colour, text, paper texture, or decorative framing.

User prompt: ${prompt}`,
    config: {
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  }));
  return response.text || prompt;
}

function getArtworkBoxRatio(params: {
  plaqueWidth: number;
  plaqueHeight: number;
  plaqueShape: Shape;
  layout: MemorialImagePlacement;
  artworkScale: number;
  safeMargin?: number;
}) {
  const safeMargin = getSafeMarginMm({
    width: params.plaqueWidth,
    height: params.plaqueHeight,
    shape: params.plaqueShape,
    safeMargin: params.safeMargin,
  });
  const safeW = Math.max(10, params.plaqueWidth - safeMargin * 2);
  const safeH = Math.max(10, params.plaqueHeight - safeMargin * 2);
  const gap = Math.max(8, Math.min(params.plaqueWidth, params.plaqueHeight) * 0.05);
  const scale = Math.max(0.1, params.artworkScale);
  const isSideLayout = params.layout === MemorialImagePlacement.PortraitLeft || params.layout === MemorialImagePlacement.PortraitRight;

  if (isSideLayout && params.plaqueShape === Shape.Rect && params.plaqueWidth / Math.max(1, params.plaqueHeight) >= 0.95) {
    const sideGap = Math.min(gap, Math.max(4, safeW * 0.08));
    const sideW = Math.max(12, (safeW - sideGap) / 2);
    const artW = Math.max(8, Math.min(sideW * scale, sideW));
    const artH = Math.min(safeH * 0.86 * scale, artW * 1.2, safeH);
    return artW / Math.max(1, artH);
  }

  const isFocus = params.layout === MemorialImagePlacement.PortraitFocus;
  const artW = safeW * Math.min(1, scale);
  const artH = Math.max(8, Math.min(safeH - gap - 18, safeH * (isFocus ? 0.68 : 0.54) * scale));
  return artW / Math.max(1, artH);
}

function nearestImageAspectRatio(ratio: number) {
  const ratios = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ] as const;

  return ratios.reduce((best, candidate) =>
    Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio) ? candidate : best
  )[0];
}

export async function generateMemorialEngraving(params: {
  sourceImageDataUrl?: string | null;
  styleReferenceDataUrl?: string | null;
  plaqueWidth: number;
  plaqueHeight: number;
  plaqueShape: Shape;
  layout: MemorialImagePlacement;
  shape: MemorialImageShape;
  artworkScale: number;
  safeMargin?: number;
  subjectHint?: string;
  mode?: EtchmasterImageMode;
  model?: EtchmasterImageModel;
  imageSize?: string;
  aspectRatio?: string;
  preset?: EtchmasterImagePreset;
  removeBackground?: boolean;
  shapeMask?: EtchmasterShapeMask;
  shapeEdge?: EtchmasterShapeEdge;
  extraPrompt?: string;
}): Promise<string> {
  const ai = getAIClient();
  const parts: any[] = [];
  const mode = params.mode || EtchmasterImageMode.Image;
  const sourceImageDataUrl = params.sourceImageDataUrl || null;
  const styleReferenceDataUrl = params.styleReferenceDataUrl || null;

  if (sourceImageDataUrl && mode !== EtchmasterImageMode.Prompt) {
    const [header, sourceData] = sourceImageDataUrl.split(",");
    const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || "image/png";
    parts.push({ inlineData: { data: await resizeImageBase64(sourceData, mimeType), mimeType } });
  }

  if (mode === EtchmasterImageMode.SubjectStyle && styleReferenceDataUrl) {
    const [styleHeader, styleData] = styleReferenceDataUrl.split(",");
    const styleMimeType = styleHeader.match(/^data:(.*?);base64$/)?.[1] || "image/png";
    parts.push({ inlineData: { data: await resizeImageBase64(styleData, styleMimeType), mimeType: styleMimeType } });
    parts.push({ text: "The first image is the subject. The second image is the style reference." });
  }

  const isSideLayout = params.layout === MemorialImagePlacement.PortraitLeft || params.layout === MemorialImagePlacement.PortraitRight;
  const artworkBoxRatio = getArtworkBoxRatio(params);
  const safeMargin = Math.round(getSafeMarginMm({
    width: params.plaqueWidth,
    height: params.plaqueHeight,
    shape: params.plaqueShape,
    safeMargin: params.safeMargin,
  }));
  const autoAspectRatio = params.shape === MemorialImageShape.Rectangle ? nearestImageAspectRatio(artworkBoxRatio) : "1:1";
  const aspectRatio = params.aspectRatio && params.aspectRatio !== "auto" ? params.aspectRatio : autoAspectRatio;
  const layoutText = isSideLayout
    ? "a softly faded portrait vignette composed for a side-by-side plaque layout"
    : params.layout === MemorialImagePlacement.PortraitFocus
      ? "a wide, softly faded hero vignette composed as the visual focus of the plaque"
      : "a wide, softly faded scene vignette composed above a short inscription";
  const hint = params.subjectHint?.trim()
    ? `User context for the subject: ${params.subjectHint.trim()}`
    : "The subject is likely a beloved pet portrait for a memorial plaque.";

  const styleInstruction = params.preset ? styleInstructions[params.preset] : styleInstructions[EtchmasterImagePreset.Engraving];
  const etchmasterShapeMask = params.shapeMask || EtchmasterShapeMask.None;
  const isHeartVignetteMask = etchmasterShapeMask === EtchmasterShapeMask.Heart
    && (params.shapeEdge || EtchmasterShapeEdge.Vignette) === EtchmasterShapeEdge.Vignette;
  const shapeMaskInstruction = getShapeMaskInstruction(
    etchmasterShapeMask,
    params.shapeEdge || EtchmasterShapeEdge.Vignette
  );
  const shapeText = etchmasterShapeMask !== EtchmasterShapeMask.None
    ? `EtchMaster shape mask is authoritative for the generated artwork. ${shapeMaskInstruction} The plaque preview may apply an additional placement clip later, but the generated artwork silhouette must follow the EtchMaster mask.`
    : params.shape === MemorialImageShape.Rectangle
      ? "The designer will place this directly as a rectangular vignette."
      : `The designer will apply the selected ${params.shape} crop after tracing. Do not draw, imply, or decorate that crop boundary in the generated artwork.`;
  const extraPrompt = params.extraPrompt?.trim();
  const modeInstruction =
    mode === EtchmasterImageMode.Prompt
      ? "Create artwork from the text prompt only. There is no source photo; follow the user prompt exactly and make it suitable for plaque production."
      : mode === EtchmasterImageMode.SubjectStyle
        ? "Faithfully preserve the first image subject and composition. Apply the second image as a style reference only; do not replace the subject."
        : "Faithfully recreate the provided source image as black and white etchable artwork. Preserve the exact subject matter, composition, proportions and layout.";

  const prompt = `
Create high-resolution black and white etchable artwork for a plaque.

${hint}
${extraPrompt ? `\nUser artwork prompt: ${extraPrompt}` : ""}

Fixed production requirements:
- ${modeInstruction}
- Preserve the actual subject, pose, face markings, proportions, and expression from the source photo.
- Output exactly one memorial engraving inside ${layoutText}.
- The available artwork box is approximately ${params.plaqueWidth}mm × ${params.plaqueHeight}mm plaque space with an artwork-box aspect ratio of ${artworkBoxRatio.toFixed(2)}:1. Compose deliberately for that space.
- Respect a hard ${safeMargin}mm safe margin from the plaque edge. Keep the subject, vignette, and useful detail comfortably inside that margin; do not let ears, head, paws, shoulders, outline, or fading edges touch the production edge.
- Compose ONLY an organically faded, borderless engraving vignette. ${shapeText}
- If using a heart vignette, the heart itself must remain legible after vector tracing: preserve or create enough interior background shading to fill the heart shape, and keep the subject inset so no ears, faces, paws, shoulders, or body outline are chopped by the heart boundary.
- Preserve ONLY environmental context that is clearly visible in the uploaded source photo: an existing chair, room, garden, landscape, floor, blanket, toy, collar, or setting may remain only if it is genuinely present and strengthens the image. Never invent, add, substitute, or beautify the scene with new benches, trees, fences, landscapes, rooms, furniture, collars, props, memorial objects, accessories, decorative motifs, or extra animals/people.
- Keep the whole subject visible without clipping ears, head, paws, or important outline. Preserve the source composition where practical and extend the vignette naturally across the available width.
- CRITICAL: the complete animal/person must fit inside the generated artwork canvas. Never place the subject partly outside the top, bottom, left, or right edge. For a lying or very horizontal pet, include the full head/face and full body silhouette; do not output only the body, legs, paws, or a cropped strip.
- Do not invent new body pose, breed features, facial markings, fur patches, ears, paws, tail, collar, accessories, or surroundings. If an area is unclear, simplify or fade it out rather than making up detail.
- Pure black engraving marks on a pure white background only.
- Banknote / burin engraving style: fine hatching, stippling, precise parallel contour lines, elegant memorial tone.
- Use ONLY a soft, irregular vignette fade so the engraving dissolves naturally into white. There must be no visible perimeter, hard crop edge, enclosing line, or frame-like boundary.
- ABSOLUTELY NO TEXT OR TYPOGRAPHY: no letters, words, numbers, name, date, caption, plaque inscription, signature, watermark, label, badge, or text-like decorative marks anywhere in the artwork.
- ABSOLUTELY NO ORNAMENTAL CONTAINER: no circular frame, oval frame, medallion, portrait border, ring, plaque outline, badge, cartouche, banner, ribbon, nameplate, caption area, or empty text-holding structure.
- No colour, no grayscale wash, no paper texture, no plaque, no frame, no border.
- The result must trace cleanly into SVG for chemical etching.
${styleInstruction ? `- EtchMaster style preset: ${styleInstruction}` : ""}
${params.removeBackground
  ? isHeartVignetteMask
    ? "- Remove background only outside the heart. Inside the heart, keep or synthesize a soft etched background/shadow field so the heart is visibly filled and does not become an invisible white cutout."
    : "- Remove the background completely; outside the subject/artwork must be pure white."
  : ""}
  `.trim();

  parts.push({ text: prompt });

  const response = await retryWrapper(() => ai.models.generateContent({
    model: params.model || MODEL,
    contents: { parts },
    config: {
      httpOptions: {
        timeout: IMAGE_GENERATION_TIMEOUT_MS,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: {
        imageSize: params.imageSize || IMAGE_GENERATION_SIZE,
        aspectRatio,
      },
    },
  }));

  return extractImageOrThrow(response);
}

async function dataUrlToTracePayload(dataUrl: string): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return {
    buffer: await blob.arrayBuffer(),
    mimeType: blob.type || "image/png",
  };
}

export async function vectorizeMemorialImage(
  dataUrl: string,
  threshold = 128,
  onProgress?: (message: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("This browser does not support background tracing workers."));
      return;
    }

    const worker = new Worker(new URL("./memorialTrace.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type?: "progress"; message?: string; svg?: string; error?: string }>) => {
      if (event.data.type === "progress") {
        if (event.data.message) onProgress?.(event.data.message);
        return;
      }
      worker.terminate();
      if (event.data.svg) {
        resolve(event.data.svg);
        return;
      }
      reject(new Error(event.data.error || "Memorial image tracing failed."));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || "Memorial image tracing worker failed."));
    };
    dataUrlToTracePayload(dataUrl)
      .then(({ buffer, mimeType }) => {
        worker.postMessage({ imageBuffer: buffer, mimeType, threshold }, [buffer]);
      })
      .catch(error => {
        worker.terminate();
        reject(error instanceof Error ? error : new Error("Could not prepare memorial image for tracing."));
      });
  });
}
