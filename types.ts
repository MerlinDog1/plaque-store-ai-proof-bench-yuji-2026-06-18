export enum Shape {
  Rect = 'rect',
  Oval = 'oval',
  Circle = 'circle',
  Heart = 'heart',
}

export enum Material {
  BrushedBrass = 'brushed-brass',
  OrbitalBrassMattLacquer = 'orbital-brass-matt-lacquer',
  PolishedBrass = 'polished-brass',
  AgedBrass = 'aged-brass',
  BrushedSteel = 'brushed-stainless',
  PolishedSteel = 'polished-stainless',
}

export enum Fixing {
  None = 'none',
  VHB = 'vhb',
  Screws = 'screws',
  Caps = 'caps',
}

export enum TextColor {
  Black = 'black',
  Grey = 'grey',
  White = 'white',
  Cream = 'cream',
}

export enum BorderStyle {
  Single = 'single',
  Double = 'double',
  Inset = 'inset',
  Scalloped = 'scalloped',
  DoubleScalloped = 'double-scalloped',
}

export enum MemorialImagePlacement {
  AboveText = 'above-text',
  PortraitLeft = 'portrait-left',
  PortraitRight = 'portrait-right',
  PortraitFocus = 'portrait-focus',
}

export enum MemorialImageMethod {
  Engraved = 'engraved',
  UvPrinted = 'uv-printed',
}

export enum MemorialImageShape {
  Rectangle = 'rectangle',
  Circle = 'circle',
  Heart = 'heart',
}

export enum EtchmasterImageMode {
  Prompt = 'prompt',
  Image = 'image',
  SubjectStyle = 'subject-style',
}

export enum EtchmasterImageModel {
  NanoBanana2 = 'gemini-3.1-flash-image-preview',
  NanoBanana1 = 'gemini-2.5-flash-image',
}

export enum EtchmasterImagePreset {
  None = '',
  Etching = 'etching',
  Engraving = 'engraving',
  LineArt = 'line-art',
  Manga = 'manga',
  ScratchBoard = 'scratch-board',
  Woodcut = 'woodcut',
  Stippling = 'stippling',
  Halftone = 'halftone',
  Hatching = 'hatching',
  Linocut = 'linocut',
}

export enum EtchmasterShapeMask {
  None = 'none',
  Circle = 'circle',
  Oval = 'oval',
  Shield = 'shield',
  Heart = 'heart',
}

export enum EtchmasterShapeEdge {
  Solid = 'solid',
  Outline = 'outline',
  Vignette = 'vignette',
}

export const TEXT_COLOR_VALUES: Record<TextColor, string> = {
  [TextColor.Black]: '#1a1a1a',
  [TextColor.Grey]: '#666666',
  [TextColor.White]: '#ffffff',
  [TextColor.Cream]: '#f5e6c8',
};

// ─── Design Style Archetypes ─────────────────────────────────────
export enum DesignStyle {
  Auto = 'auto',
  Monumental = 'monumental',
  ClassicalFormal = 'classical-formal',
  ModernMinimal = 'modern-minimal',
  HeritagePlaque = 'heritage-plaque',
  MemorialSolemn = 'memorial-solemn',
  ContemporaryBold = 'contemporary-bold',
  ArtisanCraft = 'artisan-craft',
  Institutional = 'institutional',
}

export enum TypographyEngine {
  ComposerLab = 'composer-lab',
  GeminiAuthored = 'gemini-authored',
}

export const DESIGN_STYLE_META: Record<DesignStyle, { label: string; icon: string; desc: string }> = {
  [DesignStyle.Auto]:             { label: 'Auto',           icon: '✦', desc: 'AI picks the best style' },
  [DesignStyle.Monumental]:       { label: 'Monumental',     icon: '🏛', desc: 'One massive title, commanding' },
  [DesignStyle.ClassicalFormal]:  { label: 'Classical',      icon: '📜', desc: 'Balanced serif elegance' },
  [DesignStyle.ModernMinimal]:    { label: 'Modern',         icon: '◻', desc: 'Clean sans-serif, airy' },
  [DesignStyle.HeritagePlaque]:   { label: 'Heritage',       icon: '🏰', desc: 'Period styling, ornamental' },
  [DesignStyle.MemorialSolemn]:   { label: 'Memorial',       icon: '🕊', desc: 'Dignified, solemn tribute' },
  [DesignStyle.ContemporaryBold]: { label: 'Bold',           icon: '⚡', desc: 'Mixed weights, dynamic' },
  [DesignStyle.ArtisanCraft]:     { label: 'Artisan',        icon: '✍', desc: 'Script accents, hand-crafted' },
  [DesignStyle.Institutional]:    { label: 'Institutional',  icon: '🏢', desc: 'Official, structured, caps' },
};

// ─── Curated Font Palettes ───────────────────────────────────────
// Each palette: [titleFont, bodyFont, accentFont]
export interface FontPalette {
  title: string;
  body: string;
  accent: string;
}

export const STYLE_FONT_PALETTES: Record<Exclude<DesignStyle, DesignStyle.Auto>, FontPalette[]> = {
  [DesignStyle.Monumental]: [
    { title: 'Cinzel',           body: 'Lato',           accent: 'Cinzel' },
    { title: 'Bebas Neue',      body: 'Raleway',        accent: 'Bebas Neue' },
    { title: 'Abril Fatface',   body: 'Lato',           accent: 'Lato' },
  ],
  [DesignStyle.ClassicalFormal]: [
    { title: 'Playfair Display', body: 'Lato',           accent: 'Playfair Display' },
    { title: 'EB Garamond',     body: 'Raleway',        accent: 'EB Garamond' },
    { title: 'Lora',            body: 'Open Sans',      accent: 'Lora' },
  ],
  [DesignStyle.ModernMinimal]: [
    { title: 'Montserrat',      body: 'Raleway',        accent: 'Montserrat' },
    { title: 'Raleway',         body: 'Lato',           accent: 'Raleway' },
    { title: 'Oswald',          body: 'Open Sans',      accent: 'Lato' },
  ],
  [DesignStyle.HeritagePlaque]: [
    { title: 'Cinzel',           body: 'EB Garamond',   accent: 'Cinzel' },
    { title: 'Playfair Display', body: 'Merriweather',  accent: 'Playfair Display' },
    { title: 'Lora',            body: 'EB Garamond',    accent: 'Great Vibes' },
  ],
  [DesignStyle.MemorialSolemn]: [
    { title: 'Playfair Display', body: 'Lato',           accent: 'Great Vibes' },
    { title: 'EB Garamond',     body: 'Lato',           accent: 'Pinyon Script' },
    { title: 'Cinzel',          body: 'Raleway',        accent: 'Alex Brush' },
  ],
  [DesignStyle.ContemporaryBold]: [
    { title: 'Bebas Neue',      body: 'Montserrat',     accent: 'Lato' },
    { title: 'Oswald',          body: 'Raleway',        accent: 'Montserrat' },
    { title: 'Abril Fatface',   body: 'Open Sans',      accent: 'Open Sans' },
  ],
  [DesignStyle.ArtisanCraft]: [
    { title: 'Playfair Display', body: 'Lato',           accent: 'Great Vibes' },
    { title: 'Lora',            body: 'Raleway',        accent: 'Dancing Script' },
    { title: 'Cinzel',          body: 'Montserrat',     accent: 'Allura' },
  ],
  [DesignStyle.Institutional]: [
    { title: 'Montserrat',      body: 'Open Sans',      accent: 'Montserrat' },
    { title: 'Oswald',          body: 'Lato',           accent: 'Oswald' },
    { title: 'Raleway',         body: 'Lato',           accent: 'Raleway' },
  ],
};

export interface PlaqueState {
  width: number;
  height: number;
  shape: Shape;
  material: Material;
  fixing: Fixing;
  capSize: number;
  cornerRadius: number;
  border: boolean;
  borderStyle: BorderStyle;
  reverseEtch: boolean;
  textColor: TextColor;
  wood: boolean;
  woodTone: 'light' | 'dark';
  woodEdge: 'square' | 'bevel';
  ageIntensity: number;
  designStyle: DesignStyle;
  typographyEngine: TypographyEngine;
  generatedSvgContent: string | null;
  aiReasoning: string | null;
  conceptImageUrl: string | null;
  memorialImageEnabled: boolean;
  memorialImageMethod: MemorialImageMethod;
  memorialImagePlacement: MemorialImagePlacement;
  memorialImageShape: MemorialImageShape;
  memorialImageScale: number;
  memorialImageZoom: number;
  memorialImageOffsetX: number;
  memorialImageOffsetY: number;
  safeMargin: number;
  etchmasterMode: EtchmasterImageMode;
  etchmasterModel: EtchmasterImageModel;
  etchmasterImageSize: string;
  etchmasterAspectRatio: string;
  etchmasterPreset: EtchmasterImagePreset;
  etchmasterRemoveBackground: boolean;
  etchmasterEnhancePrompt: boolean;
  etchmasterShapeMask: EtchmasterShapeMask;
  etchmasterShapeEdge: EtchmasterShapeEdge;
  etchmasterPrompt: string;
  etchmasterStyleReferenceUrl: string | null;
  etchmasterVectorThreshold: number;
  inscriptionScale: number;
  inscriptionOffsetX: number;
  inscriptionOffsetY: number;
  memorialImageSourceUrl: string | null;
  memorialImageSvg: string | null;
  memorialImagePreviewUrl: string | null;
}

export const INITIAL_STATE: PlaqueState = {
  width: 300,
  height: 200,
  shape: Shape.Rect,
  material: Material.BrushedBrass,
  fixing: Fixing.None,
  capSize: 10,
  cornerRadius: 0,
  border: false,
  borderStyle: BorderStyle.Single,
  reverseEtch: false,
  textColor: TextColor.Black,
  wood: false,
  woodTone: 'light',
  woodEdge: 'square',
  ageIntensity: 0.5,
  designStyle: DesignStyle.Auto,
  typographyEngine: TypographyEngine.GeminiAuthored,
  generatedSvgContent: null,
  aiReasoning: null,
  conceptImageUrl: null,
  memorialImageEnabled: false,
  memorialImageMethod: MemorialImageMethod.Engraved,
  memorialImagePlacement: MemorialImagePlacement.AboveText,
  memorialImageShape: MemorialImageShape.Rectangle,
  memorialImageScale: 1,
  memorialImageZoom: 1,
  memorialImageOffsetX: 0,
  memorialImageOffsetY: 0,
  safeMargin: 10,
  etchmasterMode: EtchmasterImageMode.Image,
  etchmasterModel: EtchmasterImageModel.NanoBanana2,
  etchmasterImageSize: '4K',
  etchmasterAspectRatio: 'auto',
  etchmasterPreset: EtchmasterImagePreset.Engraving,
  etchmasterRemoveBackground: false,
  etchmasterEnhancePrompt: false,
  etchmasterShapeMask: EtchmasterShapeMask.None,
  etchmasterShapeEdge: EtchmasterShapeEdge.Vignette,
  etchmasterPrompt: '',
  etchmasterStyleReferenceUrl: null,
  etchmasterVectorThreshold: 128,
  inscriptionScale: 1,
  inscriptionOffsetX: 0,
  inscriptionOffsetY: 0,
  memorialImageSourceUrl: null,
  memorialImageSvg: null,
  memorialImagePreviewUrl: null,
};

// All fonts actually loaded via Google Fonts — every font here MUST be in the <link> tag
export const AVAILABLE_FONTS = [
  // Serif
  "Cinzel", "Playfair Display", "EB Garamond", "Merriweather", "Lora",
  "Bitter", "Roboto Slab", "Abril Fatface",
  // Sans-serif
  "Montserrat", "Lato", "Open Sans", "Raleway", "Oswald", "Bebas Neue",
  // Script / Accent
  "Great Vibes", "Pinyon Script", "Alex Brush", "Allura", "Dancing Script",
  "Satisfy", "Pacifico",
];
