import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DESIGN_STYLE_META,
  DesignStyle,
  EtchmasterImageMode,
  EtchmasterImageModel,
  EtchmasterImagePreset,
  EtchmasterShapeEdge,
  EtchmasterShapeMask,
  Fixing,
  Material,
  MemorialImageMethod,
  MemorialImagePlacement,
  MemorialImageShape,
  PlaqueState,
  Shape,
  TextColor,
  AVAILABLE_FONTS,
  BorderStyle,
} from '../types';
import type { GenerationPhase } from '../services/geminiService';
import { DEFAULT_SAFE_MARGIN_PERCENT, SAFE_MARGIN_PRESETS, getSafeMarginMm, getSafeMarginPercent } from '../services/safeMargin';
import { isBenchPlaqueFormat } from '../services/plaqueRules';
import { estimatePlaqueBasePrice, estimateWoodAddOn } from '../services/pricing';

const MEMORIAL_PROMPT =
  "In loving memory of Bertie. Loyal companion, garden explorer, and forever in our hearts. 2014-2026.";

const MATERIAL_LABELS: Record<Material, string> = {
  [Material.BrushedBrass]: 'Brushed brass',
  [Material.OrbitalBrassMattLacquer]: 'Orbital brass + matt lacquer',
  [Material.PolishedBrass]: 'Polished brass',
  [Material.AgedBrass]: 'Aged brass',
  [Material.BrushedSteel]: 'Brushed steel',
  [Material.PolishedSteel]: 'Polished steel',
};

const MATERIAL_NOTES: Record<Material, string> = {
  [Material.BrushedBrass]: 'Hand-brushed satin brass with warm low-glare grain',
  [Material.OrbitalBrassMattLacquer]: 'Matt lacquered orbital brass with optional colour-filled etch',
  [Material.PolishedBrass]: 'Mirror-bright traditional presentation brass',
  [Material.AgedBrass]: 'Heritage patina with darker engraving',
  [Material.BrushedSteel]: 'Directional satin stainless with fine linear grain',
  [Material.PolishedSteel]: 'Mirror stainless with crisp reflected highlights',
};

const MATERIAL_SWATCH: Record<Material, string> = {
  [Material.BrushedBrass]: 'repeating-linear-gradient(0deg,rgba(255,238,176,.22) 0 1px,rgba(79,49,11,.14) 1px 2px,transparent 2px 5px),linear-gradient(135deg,#9f6e20,#c89b48,#8b5d18)',
  [Material.OrbitalBrassMattLacquer]: 'repeating-radial-gradient(circle at 42% 38%,rgba(255,244,194,.32) 0 1px,rgba(84,67,37,.15) 1px 2px,transparent 2px 5px),linear-gradient(135deg,#d8c17b,#9e824a,#c8af6a)',
  [Material.PolishedBrass]: 'linear-gradient(135deg,#744307 0%,#ffc43f 18%,#fff5b5 30%,#9c5a08 43%,#fff8c4 57%,#b86d0c 70%,#6b3b05 100%)',
  [Material.AgedBrass]: 'linear-gradient(135deg,#302315,#8c7034,#c0a158,#604822,#2a1d12)',
  [Material.BrushedSteel]: 'repeating-linear-gradient(0deg,rgba(255,255,255,.22) 0 1px,rgba(55,67,75,.14) 1px 2px,transparent 2px 5px),linear-gradient(135deg,#7a858b,#c7d0d4,#68727a)',
  [Material.PolishedSteel]: 'linear-gradient(135deg,#4a535b 0%,#d7dde1 15%,#ffffff 26%,#8c969e 38%,#f2f6f8 55%,#727d86 72%,#39434b 100%)',
};

const BORDER_STYLE_OPTIONS: { value: BorderStyle; label: string; note: string }[] = [
  { value: BorderStyle.Single, label: 'Single', note: 'One clean engraved keyline' },
  { value: BorderStyle.Double, label: 'Double', note: 'Two balanced inset lines' },
  { value: BorderStyle.Scalloped, label: 'Scalloped', note: 'Border sweeps around caps or screws' },
  { value: BorderStyle.DoubleScalloped, label: 'Double scalloped', note: 'Two cut-out lines around fixings' },
];

const SIZE_PRESETS = [
  { label: 'A5 landscape', note: '210 x 148mm · Most popular', shape: Shape.Rect, width: 210, height: 148 },
  { label: 'A5 portrait', note: '148 x 210mm · Door or wall', shape: Shape.Rect, width: 148, height: 210 },
  { label: 'A4 landscape', note: '297 x 210mm · Longer tributes', shape: Shape.Rect, width: 297, height: 210 },
  { label: 'A4 portrait', note: '210 x 297mm · Door or wall', shape: Shape.Rect, width: 210, height: 297 },
  { label: 'Bench plaque', note: '150 x 50mm · Bench or seat', shape: Shape.Rect, width: 150, height: 50 },
  { label: 'Wall plaque', note: '200 x 150mm · General purpose', shape: Shape.Rect, width: 200, height: 150 },
];

const MAX_CUSTOM_DIMENSION_MM = 600;

const STEP_COPY = [
  {
    eyebrow: 'Step 1 of 7',
    title: 'Material',
    detail: 'Choose the metal finish first so size prices reflect the selected material.',
  },
  {
    eyebrow: 'Step 2 of 7',
    title: 'Size/Shape',
    detail: 'Choose a standard plaque size with live starting prices, or open custom size.',
  },
  {
    eyebrow: 'Step 3 of 7',
    title: 'Colour',
    detail: 'Choose the engraved text colour used in the proof and production file.',
  },
  {
    eyebrow: 'Step 4 of 7',
    title: 'Fixings and border',
    detail: 'Set the border and production mounting method together.',
  },
  {
    eyebrow: 'Step 5 of 7',
    title: 'Wood',
    detail: 'Choose whether the plaque needs a timber backing board and edge finish.',
  },
  {
    eyebrow: 'Step 6 of 7',
    title: 'Text',
    detail: 'Enter the tribute text and choose a style. The layout assistant fits it to the available space.',
  },
  {
    eyebrow: 'Step 7 of 7',
    title: 'Proof',
    detail: 'Review the production proof, realistic render, and export options before basket.',
  },
];

interface Props {
  state: PlaqueState;
  onChange: (newState: Partial<PlaqueState>) => void;
  onGenerate: (text: string) => void;
  onClear: () => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  guidance: string;
  onGuidanceChange: (guidance: string) => void;
  onGeneratedSvgContentChange: (svgContent: string) => void;
  isGenerating: boolean;
  generationPhase: GenerationPhase;
  onMemorialImageUpload: (file: File) => void;
  onStyleReferenceUpload: (file: File) => void;
  onGenerateMemorialImage: () => void;
  onClearMemorialImage: () => void;
  isGeneratingMemorialImage: boolean;
  memorialStatus: string | null;
  activeStep: number;
  price: number;
  readinessItems: { label: string; ready: boolean; step: number }[];
  isProductionReady: boolean;
  basketAdded: boolean;
  onGoToStep: (step: number) => void;
  onSaveProof: () => void;
  onAddToBasket: () => void;
  onRealisticPreview: () => void;
  realisticPreviewPrompt: string;
  onRealisticPreviewPromptChange: (prompt: string) => void;
  realisticPreviewAspectRatio: string;
  onRealisticPreviewAspectRatioChange: (aspectRatio: string) => void;
  onExportSvg: () => void;
  onExportPdf: () => void;
  onPrint: () => void;
}

const REALISTIC_ASPECT_RATIOS = [
  ['16:9', 'Hero wide'],
  ['1:1', 'Square'],
  ['4:3', 'Landscape'],
  ['3:4', 'Portrait'],
  ['9:16', 'Story'],
];

interface GeneratedTextControl {
  index: number;
  label: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
}

const fieldClass =
  'control-input w-full min-h-[48px] rounded-lg border px-4 py-3 text-base text-[#1b231f] placeholder:text-[#9b9284] outline-none transition focus:border-[#c6932e] focus:ring-4 focus:ring-[#b98235]/20 disabled:bg-[#eee4d4] disabled:text-[#8a8275]';

const choiceClass = (active: boolean) =>
  `control-choice studio-press min-h-[54px] rounded-lg border px-4 py-3 text-left text-sm font-black transition active:scale-[0.98] ${
    active
      ? 'is-active border-[#c6932e] bg-[#f2d688] text-[#1b231f] shadow-[0_10px_30px_rgba(216,177,95,0.14)]'
      : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832] hover:border-[#c6932e]/70 hover:bg-[#efe4d1]'
  }`;

const pillClass = (active: boolean) =>
  `control-pill studio-press min-h-[44px] rounded-lg border px-4 py-2 text-center text-sm font-black transition active:scale-[0.98] ${
    active ? 'is-active border-[#c6932e] bg-[#f2d688] text-[#1b231f]' : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832] hover:border-[#c6932e]/70 hover:bg-[#efe4d1]'
  }`;

const StepIntro = ({ step }: { step: number }) => (
  <div className="step-intro mb-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9a6a16]">{STEP_COPY[step].eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight text-[#1b231f]">{STEP_COPY[step].title}</h2>
      </div>
      <span className="step-orbit">{step + 1}</span>
    </div>
    <p className="mt-2 text-sm leading-6 text-[#6a746d]">{STEP_COPY[step].detail}</p>
  </div>
);

const LayoutThumbnail = ({ layout }: { layout: MemorialImagePlacement }) => {
  const portrait = <span className="rounded bg-current opacity-35" />;
  const text = (
    <span className="flex flex-col justify-center gap-1">
      <span className="h-1 rounded-full bg-current opacity-50" />
      <span className="h-1 rounded-full bg-current opacity-35" />
      <span className="h-1 w-3/4 rounded-full bg-current opacity-35" />
    </span>
  );

  if (layout === MemorialImagePlacement.PortraitLeft) return <span className="grid h-full grid-cols-2 gap-1">{portrait}{text}</span>;
  if (layout === MemorialImagePlacement.PortraitRight) return <span className="grid h-full grid-cols-2 gap-1">{text}{portrait}</span>;
  if (layout === MemorialImagePlacement.PortraitFocus) return <span className="grid h-full grid-rows-[1fr_auto] gap-1">{portrait}<span className="mx-auto h-1 w-1/2 rounded-full bg-current opacity-40" /></span>;
  return <span className="grid h-full grid-rows-2 gap-1">{portrait}{text}</span>;
};

interface FineTuneControlProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  locked: boolean;
  onChange: (value: number) => void;
}

const clampControlValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const FineTuneControl = ({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  disabled = false,
  locked,
  onChange,
}: FineTuneControlProps) => {
  const controlDisabled = disabled || locked;
  const apply = (nextValue: number) => onChange(clampControlValue(nextValue, min, max));

  return (
    <div className={`rounded-lg border p-3 transition ${locked ? 'border-[rgba(232,219,192,0.1)] bg-[#fffaf0]' : 'border-[#b98235]/28 bg-[#f4eadc]'}`}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-[#6a746d]">
        <span>{label}</span>
        <span>{valueLabel}</span>
      </div>
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <button
          type="button"
          disabled={controlDisabled}
          onClick={() => apply(value - step)}
          className="h-11 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffdf7] text-lg font-black text-[#9a6a16] disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          -
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={controlDisabled}
          onChange={(event) => apply(Number(event.target.value))}
          className="w-full accent-[#b98235] disabled:opacity-30"
          aria-label={label}
        />
        <button
          type="button"
          disabled={controlDisabled}
          onClick={() => apply(value + step)}
          className="h-11 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffdf7] text-lg font-black text-[#9a6a16] disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
};

export const Controls: React.FC<Props> = ({
  state,
  onChange,
  onGenerate,
  onClear,
  prompt,
  onPromptChange,
  guidance,
  onGuidanceChange,
  onGeneratedSvgContentChange,
  isGenerating,
  generationPhase,
  onMemorialImageUpload,
  onStyleReferenceUpload,
  onGenerateMemorialImage,
  onClearMemorialImage,
  isGeneratingMemorialImage,
  memorialStatus,
  activeStep,
  price,
  readinessItems,
  isProductionReady,
  basketAdded,
  onGoToStep,
  onSaveProof,
  onAddToBasket,
  onRealisticPreview,
  realisticPreviewPrompt,
  onRealisticPreviewPromptChange,
  realisticPreviewAspectRatio,
  onRealisticPreviewAspectRatioChange,
  onExportSvg,
  onExportPdf,
  onPrint,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const [fineTuneUnlocked, setFineTuneUnlocked] = useState(false);
  const [sizeMode, setSizeMode] = useState<'standard' | 'custom'>('standard');
  const [fixingsBorderMode, setFixingsBorderMode] = useState<'fixings' | 'border'>('fixings');
  const [manualTextOpen, setManualTextOpen] = useState(false);
  const isIterating = !!state.generatedSvgContent;
  const portraitPreviewUrl = state.memorialImageMethod === MemorialImageMethod.UvPrinted
    ? state.memorialImageSourceUrl || state.memorialImagePreviewUrl
    : state.memorialImagePreviewUrl;
  const safeMarginPercent = getSafeMarginPercent(state.safeMargin);
  const safeMarginMm = getSafeMarginMm({
    width: state.width,
    height: state.height,
    shape: state.shape,
    safeMargin: state.safeMargin,
  });
  const pictureOffsetXLimit = Math.max(80, Math.ceil(state.width));
  const pictureOffsetYLimit = Math.max(80, Math.ceil(state.height));
  const generatedTextControls = React.useMemo<GeneratedTextControl[]>(() => {
    if (!state.generatedSvgContent || typeof DOMParser === 'undefined') return [];
    try {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${state.generatedSvgContent}</svg>`,
        'image/svg+xml'
      );
      if (doc.querySelector('parsererror')) return [];
      return Array.from(doc.querySelectorAll('text')).map((text, index) => {
        const firstTspan = text.querySelector('tspan');
        const fontFamily = text.getAttribute('font-family')
          || firstTspan?.getAttribute('font-family')
          || 'Lato';
        const fontSize = Number(text.getAttribute('font-size') || firstTspan?.getAttribute('font-size') || 12);
        const fontWeight = text.getAttribute('font-weight')
          || firstTspan?.getAttribute('font-weight')
          || '400';
        return {
          index,
          label: (text.textContent || `Line ${index + 1}`).replace(/\s+/g, ' ').trim() || `Line ${index + 1}`,
          text: text.textContent || '',
          fontFamily: AVAILABLE_FONTS.includes(fontFamily) ? fontFamily : 'Lato',
          fontSize: Number.isFinite(fontSize) ? fontSize : 12,
          fontWeight,
        };
      });
    } catch {
      return [];
    }
  }, [state.generatedSvgContent]);

  const clampDimension = (value: number) => Math.min(MAX_CUSTOM_DIMENSION_MM, Math.max(40, Number.isFinite(value) ? value : 40));
  const isHeartPlaque = state.shape === Shape.Heart;
  const isBenchPlaque = isBenchPlaqueFormat(state.width, state.height, state.shape);
  const visibleBorderStyleOptions = useMemo(() => (
    isBenchPlaque
      ? BORDER_STYLE_OPTIONS.filter((option) => option.value !== BorderStyle.Scalloped && option.value !== BorderStyle.DoubleScalloped)
      : BORDER_STYLE_OPTIONS
  ), [isBenchPlaque]);
  const shapeLabel = state.shape === Shape.Circle ? 'Circle' : state.shape === Shape.Oval ? 'Oval' : 'Rectangle';

  useEffect(() => {
    if (
      state.borderStyle === BorderStyle.Inset
      || (isBenchPlaque && (state.borderStyle === BorderStyle.Scalloped || state.borderStyle === BorderStyle.DoubleScalloped))
    ) {
      onChange({ borderStyle: BorderStyle.Single });
    }
  }, [isBenchPlaque, onChange, state.borderStyle]);

  const update = (key: keyof PlaqueState, value: any) => {
    if (key === 'width' || key === 'height') value = clampDimension(value);
    if (key === 'width' && state.shape === Shape.Circle) {
      onChange({ width: value, height: value });
      return;
    }
    if (key === 'shape' && value === Shape.Circle) {
      onChange({ shape: value, height: state.width, cornerRadius: 0 });
      return;
    }
    if (key === 'shape' && value === Shape.Heart) {
      onChange({
        shape: value,
        width: 180,
        height: 160,
        wood: false,
        fixing: Fixing.VHB,
        memorialImageEnabled: false,
      });
      return;
    }
    onChange({
      [key]: value,
      ...(key === 'shape' ? { cornerRadius: 0 } : {}),
    });
  };

  const applySizePreset = (preset: (typeof SIZE_PRESETS)[number]) => {
    const presetIsBenchPlaque = isBenchPlaqueFormat(preset.width, preset.height, preset.shape);
    onChange({
      shape: preset.shape,
      width: preset.width,
      height: preset.height,
      cornerRadius: 0,
      ...(presetIsBenchPlaque ? { border: false, wood: false } : {}),
      ...(preset.shape === Shape.Heart
        ? {
            wood: false,
            fixing: Fixing.VHB,
            memorialImageEnabled: false,
          }
        : {}),
    });
  };

  const formatPrice = (value: number) => value.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
  const priceForPreset = (preset: (typeof SIZE_PRESETS)[number]) => estimatePlaqueBasePrice({
    ...state,
    shape: preset.shape,
    width: preset.width,
    height: preset.height,
    cornerRadius: 0,
    wood: false,
  });
  const woodAddOnPrice = estimateWoodAddOn(state);

  const updateGeneratedTextLine = (lineIndex: number, changes: Partial<Pick<GeneratedTextControl, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight'>>) => {
    if (!state.generatedSvgContent || typeof DOMParser === 'undefined') return;
    try {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${state.generatedSvgContent}</svg>`,
        'image/svg+xml'
      );
      if (doc.querySelector('parsererror')) return;
      const text = Array.from(doc.querySelectorAll('text'))[lineIndex];
      if (!text) return;

      if (typeof changes.text === 'string') {
        const tspans = Array.from(text.querySelectorAll('tspan'));
        if (tspans.length) {
          tspans[0].textContent = changes.text;
          tspans.slice(1).forEach(tspan => tspan.remove());
        } else {
          text.textContent = changes.text;
        }
      }
      if (changes.fontFamily) {
        text.setAttribute('font-family', changes.fontFamily);
        text.querySelectorAll('tspan').forEach(tspan => tspan.setAttribute('font-family', changes.fontFamily!));
      }
      if (typeof changes.fontSize === 'number' && Number.isFinite(changes.fontSize)) {
        const nextSize = Math.min(120, Math.max(4, changes.fontSize));
        text.setAttribute('font-size', nextSize.toFixed(2));
        text.querySelectorAll('tspan').forEach(tspan => tspan.setAttribute('font-size', nextSize.toFixed(2)));
      }
      if (changes.fontWeight) {
        text.setAttribute('font-weight', changes.fontWeight);
        text.querySelectorAll('tspan').forEach(tspan => tspan.setAttribute('font-weight', changes.fontWeight!));
      }

      const nextSvg = Array.from(doc.documentElement.children)
        .map(node => new XMLSerializer().serializeToString(node).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''))
        .join('\n');
      onGeneratedSvgContentChange(nextSvg);
    } catch (error) {
      console.warn('Manual text edit failed.', error);
    }
  };

  const useMemorialCopy = () => {
    onPromptChange(MEMORIAL_PROMPT);
    onChange({ designStyle: DesignStyle.MemorialSolemn });
  };

  const submitPrompt = () => {
    const copy = prompt.trim();
    if (!copy) return;
    onGenerate(copy);
  };

  return (
    <div className="controls-instrument rounded-lg p-4 text-[#1b231f] md:p-5">
      <StepIntro step={activeStep} />

      {activeStep === 1 && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#efe4d1] p-1">
              <button
                type="button"
                onClick={() => setSizeMode('standard')}
                aria-pressed={sizeMode === 'standard'}
                className={`min-h-[44px] rounded-lg px-3 text-sm font-black transition ${
                  sizeMode === 'standard' ? 'bg-[#f2d688] text-[#1b231f] shadow-sm' : 'text-[#2f3832] hover:bg-[#efe4d1]'
                }`}
              >
                Standard sizes
              </button>
              <button
                type="button"
                onClick={() => setSizeMode('custom')}
                aria-pressed={sizeMode === 'custom'}
                className={`min-h-[44px] rounded-lg px-3 text-sm font-black transition ${
                  sizeMode === 'custom' ? 'bg-[#f2d688] text-[#1b231f] shadow-sm' : 'text-[#2f3832] hover:bg-[#efe4d1]'
                }`}
              >
                Custom size
              </button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="mt-4">
                <div className="text-sm font-black">{sizeMode === 'standard' ? 'Standard size presets' : 'Custom size controls'}</div>
                <div className="text-xs leading-5 text-[#6a746d]">
                  {sizeMode === 'standard'
                    ? 'Choose the common production size. Prices update from your selected material.'
                    : `Set an exact ${shapeLabel.toLowerCase()} size for this plaque.`}
                </div>
              </div>
            </div>

            {sizeMode === 'standard' ? (
              <div className="size-preset-stack mt-3 grid gap-2">
                {SIZE_PRESETS.map((preset) => {
                  const active = state.shape === preset.shape && state.width === preset.width && state.height === preset.height;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => applySizePreset(preset)}
                      aria-pressed={active}
                      className={`${choiceClass(active)} size-preset-option grid grid-cols-[64px_1fr_auto] items-center gap-3`}
                    >
                      <span className="size-mini-stage flex h-12 w-16 items-center justify-center rounded-lg">
                        <span
                          className="size-mini-plate block border border-current/40 bg-current/10"
                          style={{
                            width: `${Math.max(24, Math.min(52, preset.width / 6))}px`,
                            height: `${Math.max(10, Math.min(34, preset.height / 6))}px`,
                          }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{preset.label}</span>
                        <span className="mt-1 block text-[11px] font-bold opacity-70">{preset.note}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="size-dims rounded-full px-2 py-1 text-[10px] font-black">{preset.width} x {preset.height}</span>
                        <span className="rounded-full bg-[#1b231f] px-2 py-1 text-[10px] font-black text-[#f2d688]">
                          from {formatPrice(priceForPreset(preset))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 space-y-4 border-t border-[rgba(84, 72, 52, 0.14)] pt-4">
                <div>
                  <div className="text-sm font-black">Custom size and shape</div>
                  <div className="mt-1 text-xs leading-5 text-[#6a746d]">{shapeLabel} · {state.width} x {state.height}mm</div>
                  <div className="mt-2 inline-flex rounded-full bg-[#1b231f] px-3 py-1 text-xs font-black text-[#f2d688]">
                    Estimate {formatPrice(estimatePlaqueBasePrice(state))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    [Shape.Rect, 'Rectangle'],
                    [Shape.Oval, 'Oval'],
                    [Shape.Circle, 'Circle'],
                  ].map(([shape, label]) => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => update('shape', shape)}
                      aria-pressed={state.shape === shape}
                      className={pillClass(state.shape === shape)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wide text-[#6a746d]">
                      <span>{state.shape === Shape.Circle ? 'Diameter mm' : 'Width mm'}</span>
                      <span className="text-[#1b231f]">{state.width}</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max={MAX_CUSTOM_DIMENSION_MM}
                      step="1"
                      value={state.width}
                      onChange={(e) => update('width', Number(e.target.value))}
                      className="w-full accent-[#b98235]"
                    />
                    <input
                      type="number"
                      min="40"
                      max={MAX_CUSTOM_DIMENSION_MM}
                      step="1"
                      value={state.width}
                      onChange={(e) => update('width', Number(e.target.value))}
                      className={`${fieldClass} mt-2`}
                    />
                  </label>

                  {state.shape !== Shape.Circle && (
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wide text-[#6a746d]">
                        <span>Height mm</span>
                        <span className="text-[#1b231f]">{state.height}</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max={MAX_CUSTOM_DIMENSION_MM}
                        step="1"
                        value={state.height}
                        onChange={(e) => update('height', Number(e.target.value))}
                        className="w-full accent-[#b98235]"
                      />
                      <input
                        type="number"
                        min="40"
                        max={MAX_CUSTOM_DIMENSION_MM}
                        step="1"
                        value={state.height}
                        onChange={(e) => update('height', Number(e.target.value))}
                        className={`${fieldClass} mt-2`}
                      />
                    </label>
                  )}
                </div>

              </div>
            )}
          </div>
        </section>
      )}

      {activeStep === 0 && (
        <section className="space-y-4">
          <div className="grid gap-2">
            {Object.values(Material).map((material) => (
              <button
                key={material}
                onClick={() => update('material', material)}
                aria-pressed={state.material === material}
                className={`flex min-h-[64px] items-center gap-3 rounded-lg border p-3 text-left transition active:scale-[0.99] ${
                  state.material === material ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]' : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#1b231f]'
                }`}
              >
                <span className="h-10 w-10 shrink-0 rounded-lg border border-black/10" style={{ background: MATERIAL_SWATCH[material] }} />
                <span>
                  <span className="block text-sm font-black">{MATERIAL_LABELS[material]}</span>
                  <span className="block text-xs leading-4 opacity-70">{MATERIAL_NOTES[material]}</span>
                </span>
              </button>
            ))}
          </div>

          {state.material === Material.AgedBrass && (
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <div className="flex justify-between text-sm font-black">
                <span>Patina depth</span>
                <span>{Math.round(state.ageIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={state.ageIntensity * 100}
                onChange={(e) => update('ageIntensity', Number(e.target.value) / 100)}
                className="mt-3 w-full accent-[#b98235]"
              />
            </div>
          )}
        </section>
      )}

      {activeStep === 2 && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="text-sm font-black">Engraving colour</div>
            <div className="mt-1 text-xs leading-5 text-[#6a746d]">
              This controls the visible inscription colour in the proof and final SVG.
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                [TextColor.Black, '#1a1a1a', 'Black'],
                [TextColor.Grey, '#666666', 'Grey'],
                [TextColor.White, '#ffffff', 'White'],
                [TextColor.Cream, '#f5e6c8', 'Cream'],
              ].map(([color, swatch, label]) => (
                <button key={color} onClick={() => update('textColor', color)} className={pillClass(state.textColor === color)}>
                  <span className="mx-auto mb-1 block h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: swatch }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="space-y-4">
          {isHeartPlaque && (
            <div className="rounded-lg border border-[rgba(88,199,176,0.26)] bg-[#151f1b] p-4 text-sm font-bold leading-6 text-[#1f755f]">
              Heart plaques are supplied without visible fixings. Hidden adhesive is locked for this shape.
            </div>
          )}
          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#efe4d1] p-1">
              <button
                type="button"
                onClick={() => setFixingsBorderMode('fixings')}
                aria-pressed={fixingsBorderMode === 'fixings'}
                className={`min-h-[44px] rounded-lg px-3 text-sm font-black transition ${
                  fixingsBorderMode === 'fixings' ? 'bg-[#f2d688] text-[#1b231f] shadow-sm' : 'text-[#2f3832] hover:bg-[#efe4d1]'
                }`}
              >
                Fixings
              </button>
              <button
                type="button"
                onClick={() => setFixingsBorderMode('border')}
                aria-pressed={fixingsBorderMode === 'border'}
                className={`min-h-[44px] rounded-lg px-3 text-sm font-black transition ${
                  fixingsBorderMode === 'border' ? 'bg-[#f2d688] text-[#1b231f] shadow-sm' : 'text-[#2f3832] hover:bg-[#efe4d1]'
                }`}
              >
                Border
              </button>
            </div>

            <div className="mt-4">
              <div className="text-sm font-black">{fixingsBorderMode === 'fixings' ? 'Fixings' : 'Border'}</div>
              <div className="mt-1 text-xs leading-5 text-[#6a746d]">
                {fixingsBorderMode === 'fixings'
                  ? 'Choose visible hardware or a clean hidden mount.'
                  : isBenchPlaque
                    ? 'Choose a simple bench-plaque border style.'
                    : 'Choose whether to add a border and which style to use.'}
              </div>
            </div>

            {fixingsBorderMode === 'fixings' ? (
              <div className="mt-3 grid gap-2">
                {[
                  [Fixing.Caps, 'Decorative caps', 'Thin flat metal caps for a traditional finished plaque'],
                  [Fixing.Screws, 'Countersunk screws', 'Flush screws colour-matched to the selected plaque material'],
                  [Fixing.VHB, 'Hidden adhesive', 'Clean face with no visible holes or mounting hardware'],
                ].map(([fixing, label, note]) => (
                  <button
                    key={fixing}
                    onClick={() => !isHeartPlaque && update('fixing', fixing)}
                    disabled={isHeartPlaque && fixing !== Fixing.VHB}
                    className={`min-h-[64px] rounded-lg border p-4 text-left transition active:scale-[0.99] ${
                      state.fixing === fixing ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]' : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#1b231f]'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="block text-sm font-black">{label}</span>
                    <span className="mt-1 block text-xs leading-4 opacity-70">{note}</span>
                  </button>
                ))}

                {state.fixing === Fixing.Caps && (
                  <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] p-3">
                    <div className="mb-2 text-sm font-black">Cap diameter</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[10, 15].map((size) => (
                        <button key={size} onClick={() => update('capSize', size)} className={pillClass(state.capSize === size)}>
                          {size}mm caps
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <button
                  onClick={() => update('border', !state.border)}
                  className={`${pillClass(state.border)} w-full`}
                >
                  Border {state.border ? 'on' : 'off'}
                </button>

                {state.border && (
                  <div className="grid grid-cols-2 gap-2">
                    {visibleBorderStyleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => update('borderStyle', option.value)}
                        aria-pressed={state.borderStyle === option.value}
                        className={choiceClass(state.borderStyle === option.value)}
                      >
                        <span className="block">{option.label}</span>
                        <span className="mt-1 block text-[11px] font-bold opacity-70">{option.note}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {false && activeStep === 99 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div>
              <div className="text-sm font-black">Optional artwork</div>
              <div className="text-xs text-[#6a746d]">Most plaques should stay text-only. Add image artwork only when needed.</div>
            </div>
            <button onClick={() => onChange({ memorialImageEnabled: !state.memorialImageEnabled })} aria-pressed={state.memorialImageEnabled} className={pillClass(state.memorialImageEnabled)}>
              {state.memorialImageEnabled ? 'On' : 'Off'}
            </button>
          </div>

          {state.memorialImageEnabled && <>
          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#6a746d]">Artwork method</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                [MemorialImageMethod.Engraved, 'Engraved artwork', 'Black engraved artwork'],
                [MemorialImageMethod.UvPrinted, 'UV printed', 'Full colour print direct to metal'],
              ].map(([method, label, note]) => (
                <button
                  key={method}
                  onClick={() => onChange({ memorialImageMethod: method as MemorialImageMethod })}
                  disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
                  className={`min-h-[74px] rounded-lg border p-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                    state.memorialImageMethod === method ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]' : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832]'
                  }`}
                >
                  <span className="block text-sm font-black">{label}</span>
                  <span className="mt-1 block text-[11px] font-bold leading-4 opacity-70">{note}</span>
                </button>
              ))}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,.avif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onMemorialImageUpload(file);
            }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[#c6932e]/45 bg-[#fffaf0] p-3 text-left transition disabled:opacity-50"
          >
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#efe4d1]">
              {portraitPreviewUrl ? (
                <img src={portraitPreviewUrl} alt="Uploaded artwork" className="h-full w-full object-contain" />
              ) : (
                <span className="text-3xl font-light text-[#7d9188]">+</span>
              )}
            </span>
            <span>
              <span className="block text-base font-black">{portraitPreviewUrl ? 'Replace artwork' : 'Upload artwork'}</span>
              <span className="mt-1 block text-xs leading-5 text-[#6a746d]">PNG, JPEG, WebP, or AVIF source image.</span>
            </span>
          </button>

          <input
            ref={styleInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,.avif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onStyleReferenceUpload(file);
            }}
          />

          {state.memorialImageMethod === MemorialImageMethod.Engraved && (
            <details open className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <summary className="cursor-pointer text-sm font-black text-[#1b231f]">EtchMaster image settings</summary>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#6a746d]">Input mode</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      [EtchmasterImageMode.Prompt, 'Prompt'],
                      [EtchmasterImageMode.Image, 'Image'],
                      [EtchmasterImageMode.SubjectStyle, 'Subject + style'],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => onChange({ etchmasterMode: mode as EtchmasterImageMode })}
                        className={pillClass(state.etchmasterMode === mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {state.etchmasterMode === EtchmasterImageMode.SubjectStyle && (
                  <button
                    onClick={() => styleInputRef.current?.click()}
                    disabled={isGeneratingMemorialImage}
                    className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[#c6932e]/45 bg-[#f6efe2] p-3 text-left transition disabled:opacity-50"
                  >
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#efe4d1]">
                      {state.etchmasterStyleReferenceUrl ? (
                        <img src={state.etchmasterStyleReferenceUrl} alt="EtchMaster style reference" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-2xl font-light text-[#7d9188]">+</span>
                      )}
                    </span>
                    <span>
                      <span className="block text-sm font-black">{state.etchmasterStyleReferenceUrl ? 'Replace style reference' : 'Upload style reference'}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#6a746d]">Second image used for style only.</span>
                    </span>
                  </button>
                )}

                <label className="block text-xs font-black uppercase tracking-wide text-[#6a746d]">
                  Prompt
                  <textarea
                    value={state.etchmasterPrompt}
                    onChange={(event) => onChange({ etchmasterPrompt: event.target.value })}
                    placeholder="Optional art direction, e.g. more stippled shading, stronger banknote hatching, cleaner white background..."
                    className={`${fieldClass} mt-1 min-h-[96px] resize-none normal-case tracking-normal`}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    Model
                    <select
                      value={state.etchmasterModel}
                      onChange={(event) => {
                        const model = event.target.value as EtchmasterImageModel;
                        onChange({
                          etchmasterModel: model,
                          ...(model === EtchmasterImageModel.NanoBanana1 && ['4:1', '1:4', '8:1', '1:8'].includes(state.etchmasterAspectRatio)
                            ? { etchmasterAspectRatio: '1:1' }
                            : {}),
                        });
                      }}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value={EtchmasterImageModel.NanoBanana2}>Nano Banana 2</option>
                      <option value={EtchmasterImageModel.NanoBanana1}>Nano Banana 1</option>
                    </select>
                  </label>

                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    Image size
                    <select
                      value={state.etchmasterImageSize}
                      disabled={state.etchmasterModel !== EtchmasterImageModel.NanoBanana2}
                      onChange={(event) => onChange({ etchmasterImageSize: event.target.value })}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value="512px">512px</option>
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    Aspect ratio
                    <select
                      value={state.etchmasterAspectRatio}
                      onChange={(event) => onChange({ etchmasterAspectRatio: event.target.value })}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value="auto">Auto from plaque box</option>
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                      <option value="3:4">3:4</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      {state.etchmasterModel === EtchmasterImageModel.NanoBanana2 && (
                        <>
                          <option value="4:1">4:1</option>
                          <option value="1:4">1:4</option>
                          <option value="8:1">8:1</option>
                          <option value="1:8">1:8</option>
                        </>
                      )}
                    </select>
                  </label>

                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    Style preset
                    <select
                      value={state.etchmasterPreset}
                      onChange={(event) => onChange({ etchmasterPreset: event.target.value as EtchmasterImagePreset })}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value={EtchmasterImagePreset.None}>None</option>
                      <option value={EtchmasterImagePreset.Etching}>Etching</option>
                      <option value={EtchmasterImagePreset.Engraving}>Engraving</option>
                      <option value={EtchmasterImagePreset.LineArt}>Line art</option>
                      <option value={EtchmasterImagePreset.Manga}>Manga</option>
                      <option value={EtchmasterImagePreset.ScratchBoard}>Scratchboard</option>
                      <option value={EtchmasterImagePreset.Woodcut}>Woodcut</option>
                      <option value={EtchmasterImagePreset.Stippling}>Stippling</option>
                      <option value={EtchmasterImagePreset.Halftone}>Halftone</option>
                      <option value={EtchmasterImagePreset.Hatching}>Hatching</option>
                      <option value={EtchmasterImagePreset.Linocut}>Linocut</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    EtchMaster shape
                    <select
                      value={state.etchmasterShapeMask}
                      onChange={(event) => onChange({ etchmasterShapeMask: event.target.value as EtchmasterShapeMask })}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value={EtchmasterShapeMask.None}>None</option>
                      <option value={EtchmasterShapeMask.Circle}>Circle</option>
                      <option value={EtchmasterShapeMask.Oval}>Oval</option>
                      <option value={EtchmasterShapeMask.Shield}>Shield</option>
                      <option value={EtchmasterShapeMask.Heart}>Heart</option>
                    </select>
                  </label>

                  <label className="text-xs font-black uppercase tracking-wide text-[#6a746d]">
                    Vignette edge
                    <select
                      value={state.etchmasterShapeEdge}
                      disabled={state.etchmasterShapeMask === EtchmasterShapeMask.None}
                      onChange={(event) => onChange({ etchmasterShapeEdge: event.target.value as EtchmasterShapeEdge })}
                      className={`${fieldClass} mt-1`}
                    >
                      <option value={EtchmasterShapeEdge.Solid}>Solid</option>
                      <option value={EtchmasterShapeEdge.Outline}>Outline</option>
                      <option value={EtchmasterShapeEdge.Vignette}>Vignette</option>
                    </select>
                  </label>
                </div>
                {state.etchmasterShapeMask === EtchmasterShapeMask.Heart && (
                  <p className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] px-3 py-2 text-xs leading-5 text-[#6a746d]">
                    Heart vignettes keep or add etched background shading inside the heart, so the shape stays readable and the subject is not cut by the lobes or point.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onChange({ etchmasterEnhancePrompt: !state.etchmasterEnhancePrompt })}
                    className={pillClass(state.etchmasterEnhancePrompt)}
                  >
                    Prompt enhance {state.etchmasterEnhancePrompt ? 'on' : 'off'}
                  </button>
                  <button
                    onClick={() => onChange({ etchmasterRemoveBackground: !state.etchmasterRemoveBackground })}
                    className={pillClass(state.etchmasterRemoveBackground)}
                  >
                    Remove background {state.etchmasterRemoveBackground ? 'on' : 'off'}
                  </button>
                </div>

                <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black">Vector threshold</div>
                      <div className="text-xs text-[#6a746d]">Lower keeps more faint marks; higher gives cleaner sparse paths.</div>
                    </div>
                    <div className="text-sm font-black text-[#9a6a16]">{state.etchmasterVectorThreshold}</div>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="220"
                    value={state.etchmasterVectorThreshold}
                    onChange={(event) => onChange({ etchmasterVectorThreshold: Number(event.target.value) })}
                    className="mt-4 w-full accent-[#b98235]"
                  />
                </div>
              </div>
            </details>
          )}

          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#6a746d]">Production layout</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                [MemorialImagePlacement.AboveText, 'Artwork above', 'Text below'],
                [MemorialImagePlacement.PortraitLeft, 'Artwork left', 'Text right'],
                [MemorialImagePlacement.PortraitRight, 'Text left', 'Artwork right'],
                [MemorialImagePlacement.PortraitFocus, 'Artwork focus', 'Short wording below'],
              ].map(([layout, label, note]) => (
                <button
                  key={layout}
                  onClick={() => onChange({ memorialImagePlacement: layout as MemorialImagePlacement })}
                  disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
                  className={`rounded-lg border p-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                    state.memorialImagePlacement === layout ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]' : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832]'
                  }`}
                >
                  <span className="mb-3 block h-12 rounded-lg border border-current/20 p-1.5 opacity-80">
                    <LayoutThumbnail layout={layout as MemorialImagePlacement} />
                  </span>
                  <span className="block text-sm font-black">{label}</span>
                  <span className="mt-1 block text-[11px] font-bold opacity-70">{note}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-[#6a746d]">
              Wide plaques use a wide vignette so useful room, chair, and landscape context can stay in the engraving.
            </p>
          </div>

          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#6a746d]">Proof clip only</div>
            <p className="mb-2 text-xs leading-5 text-[#6a746d]">
              EtchMaster shape controls the generated vignette. This only clips/places the finished artwork on the proof.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                [MemorialImageShape.Rectangle, 'Rectangle'],
                [MemorialImageShape.Circle, 'Circle'],
                [MemorialImageShape.Heart, 'Heart'],
              ].map(([shape, label]) => (
                <button
                  key={shape}
                  onClick={() => onChange({ memorialImageShape: shape as MemorialImageShape })}
                  disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
                  className={pillClass(state.memorialImageShape === shape)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">Artwork size</div>
                <div className="text-xs text-[#6a746d]">Changes how much plaque space the vignette gets.</div>
              </div>
              <div className="text-sm font-black text-[#9a6a16]">{Math.round(state.memorialImageScale * 100)}%</div>
            </div>
            <input
              type="range"
              min="25"
              max="500"
              value={Math.round(state.memorialImageScale * 100)}
              disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
              onChange={(event) => onChange({ memorialImageScale: Number(event.target.value) / 100 })}
              className="mt-4 w-full accent-[#b98235] disabled:opacity-50"
            />
          </div>

          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">Photo fit</div>
                <div className="text-xs text-[#6a746d]">Zooms the image inside the artwork area after generation.</div>
              </div>
              <div className="text-sm font-black text-[#9a6a16]">{Math.round(state.memorialImageZoom * 100)}%</div>
            </div>
            <input
              type="range"
              min="25"
              max="500"
              value={Math.round(state.memorialImageZoom * 100)}
              disabled={isGeneratingMemorialImage || !state.memorialImageEnabled}
              onChange={(event) => onChange({ memorialImageZoom: Number(event.target.value) / 100 })}
              className="mt-4 w-full accent-[#b98235] disabled:opacity-50"
            />
          </div>

          <div className={state.memorialImageMethod === MemorialImageMethod.Engraved ? 'grid grid-cols-[1fr_auto] gap-2' : 'grid gap-2'}>
            {state.memorialImageMethod === MemorialImageMethod.Engraved ? (
              <button
                onClick={onGenerateMemorialImage}
                disabled={
                  isGeneratingMemorialImage ||
                  !state.memorialImageEnabled ||
                  (state.etchmasterMode !== EtchmasterImageMode.Prompt && !portraitPreviewUrl) ||
                  (state.etchmasterMode === EtchmasterImageMode.SubjectStyle && !state.etchmasterStyleReferenceUrl)
                }
                className="min-h-[52px] rounded-lg bg-[#f2d688] px-4 py-3 text-sm font-black text-[#1b231f] transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingMemorialImage ? 'Generating engraving...' : 'Generate engraving'}
              </button>
            ) : (
              <div className="rounded-lg border border-[rgba(88,199,176,0.26)] bg-[#151f1b] p-3 text-xs font-bold leading-5 text-[#1f755f]">
                UV print uses the uploaded colour image directly. Use artwork size for plaque space and photo fit only if you want the image tighter. No engraving generation is needed.
              </div>
            )}
            {(portraitPreviewUrl || state.memorialImageSvg) && (
              <button onClick={onClearMemorialImage} disabled={isGeneratingMemorialImage} className={pillClass(false)}>
                Clear
              </button>
            )}
          </div>

          {memorialStatus && <div className="rounded-lg border border-[#d9c289] bg-[#221d12] p-3 text-xs leading-5 text-[#e8c875]">{memorialStatus}</div>}
          </>}
        </section>
      )}

      {activeStep === 4 && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">Wood backing</div>
                <div className="text-xs text-[#6a746d]">
                  {isHeartPlaque ? 'Not available on heart plaques.' : `Adds ${formatPrice(woodAddOnPrice)} for a 15mm timber backing board.`}
                </div>
              </div>
              <button
                onClick={() => !isHeartPlaque && update('wood', !state.wood)}
                disabled={isHeartPlaque}
                className={`${pillClass(state.wood)} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isHeartPlaque ? 'Not available' : state.wood ? `Added ${formatPrice(woodAddOnPrice)}` : `Add ${formatPrice(woodAddOnPrice)}`}
              </button>
            </div>
            {state.wood && !isHeartPlaque && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => update('woodTone', 'light')} className={pillClass(state.woodTone === 'light')}>Light oak</button>
                <button onClick={() => update('woodTone', 'dark')} className={pillClass(state.woodTone === 'dark')}>Dark mahogany</button>
                <button onClick={() => update('woodEdge', 'square')} className={pillClass(state.woodEdge === 'square')}>Square edge</button>
                <button onClick={() => update('woodEdge', 'bevel')} className={pillClass(state.woodEdge === 'bevel')}>Bevel edge</button>
              </div>
            )}
          </div>
        </section>
      )}

      {activeStep === 5 && (
        <section className="space-y-4">
          <div className="ai-typesetter-panel rounded-lg border border-[#d7b66a]/35 bg-[#151f1b] p-4">
            <div className="flex items-start gap-3">
              <div className={`ai-typesetter-orb ${isGenerating ? 'is-working' : ''}`} aria-hidden="true">
                <span />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f2d688]">Intelligent AI typesetter</p>
                <h3 className="mt-1 text-lg font-black leading-tight text-[#edf3ef]">Enter your text below and our AI typesetter will lay it out.</h3>
                <p className="mt-2 text-sm leading-6 text-[#aab8b0]">
                  It chooses the line breaks, hierarchy, spacing, and font balance for the plaque size you have selected.
                </p>
              </div>
            </div>
            {isGenerating && (
              <div className="mt-4 rounded-lg border border-[#f2d688]/25 bg-[#f2d688]/10 p-3" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-[#f7d98b]">
                  <span>
                    {generationPhase === 'concept'
                      ? 'Reading the wording'
                      : generationPhase === 'transcribe'
                        ? 'Setting the plaque type'
                        : 'AI layout in progress'}
                  </span>
                  <span className="ai-typesetter-dots" aria-hidden="true"><i /><i /><i /></span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf3ef]/10">
                  <div className="ai-typesetter-progress h-full rounded-full bg-[#f2d688]" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2" aria-label="Choose a typography style">
            {Object.values(DesignStyle).map((style) => {
              const meta = DESIGN_STYLE_META[style];
              return (
                <button key={style} onClick={() => onChange({ designStyle: style })} className={pillClass(state.designStyle === style)} title={meta.desc}>
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3">
            <div>
              <label htmlFor="inscription-wording-input" className="block text-xs font-black uppercase tracking-wide text-[#6a746d]">
                Enter your text
              </label>
              <textarea
                id="inscription-wording-input"
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Type the words you want on the plaque..."
                className={`${fieldClass} mt-1 min-h-[190px] resize-none normal-case leading-6 tracking-normal`}
              />
            </div>
          </div>

          {!isIterating && (
          <div className="grid gap-2">
            <button
              onClick={() => {
                setManualTextOpen(false);
                submitPrompt();
              }}
              disabled={isGenerating || !prompt.trim()}
              className="min-h-[52px] rounded-lg bg-[#f2d688] px-4 py-3 text-sm font-black text-[#1b231f] transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating
                ? generationPhase === 'concept'
                  ? 'Creating concept...'
                  : generationPhase === 'transcribe'
                    ? 'Fitting your layout...'
                    : 'Working...'
                : isIterating
                  ? 'Regenerate'
                  : 'Generate AI layout'}
            </button>
            {!isIterating && (
              <button onClick={useMemorialCopy} disabled={isGenerating} className={pillClass(false)}>
                Sample wording
              </button>
            )}
          </div>
          )}

          {isIterating && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualTextOpen(false);
                    submitPrompt();
                  }}
                  disabled={isGenerating || !prompt.trim()}
                  className="min-h-[48px] rounded-lg border border-[#f2d688]/55 bg-[#f2d688] px-4 py-3 text-sm font-black text-[#13201c] transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => setManualTextOpen((open) => !open)}
                  className={`min-h-[48px] rounded-lg border px-4 py-3 text-sm font-black transition ${
                    manualTextOpen
                      ? 'border-[#f2d688]/65 bg-[#f2d688]/18 text-[#f7d98b]'
                      : 'border-[#edf3ef]/18 bg-[#edf3ef]/8 text-[#edf3ef]'
                  }`}
                  aria-expanded={manualTextOpen}
                >
                  {manualTextOpen ? 'Hide manual tweaks' : 'Tweak manually'}
                </button>
              </div>

              {manualTextOpen && (
                <div className="manual-line-panel rounded-lg border border-[#f2d688]/35 bg-[#111b1a] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-[#f2d688]">Line by line controls</div>
                    <p className="mt-1 text-xs leading-5 text-[#aab8b0]">Edit the generated text blocks directly without asking the AI to redraw the layout.</p>
                  </div>
                  <span className="rounded-full border border-[#edf3ef]/14 bg-[#edf3ef]/8 px-2 py-1 text-[10px] font-black text-[#edf3ef]">
                    {generatedTextControls.length} lines
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {generatedTextControls.length ? generatedTextControls.map((line) => (
                    <div key={line.index} className="rounded-lg border border-[#edf3ef]/14 bg-[#edf3ef]/6 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-black text-[#edf3ef]" htmlFor={`generated-text-line-${line.index}`}>
                          Line {line.index + 1}
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateGeneratedTextLine(line.index, { fontWeight: line.fontWeight === '700' || line.fontWeight === 'bold' ? '400' : '700' })}
                            aria-pressed={line.fontWeight === '700' || line.fontWeight === 'bold'}
                            aria-label={`Toggle bold for ${line.label}`}
                            className={`h-[38px] w-[38px] rounded-lg border text-sm font-black transition ${
                              line.fontWeight === '700' || line.fontWeight === 'bold'
                                ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]'
                                : 'border-[#edf3ef]/18 bg-[#edf3ef]/8 text-[#edf3ef] hover:border-[#c6932e]'
                            }`}
                            title="Toggle bold"
                          >
                            B
                          </button>
                          <label className="flex min-w-[118px] items-center gap-2 text-xs font-black text-[#aab8b0]">
                            <span>Size</span>
                            <input
                              type="number"
                              min="4"
                              max="120"
                              step="0.5"
                              value={line.fontSize}
                              onChange={(event) => updateGeneratedTextLine(line.index, { fontSize: Number(event.target.value) })}
                              className="h-[38px] w-[74px] rounded-lg border border-[#edf3ef]/18 bg-[#0f1817] px-2 text-sm font-black text-[#edf3ef] outline-none transition focus:border-[#c6932e] focus:ring-4 focus:ring-[#b98235]/20"
                              aria-label={`Font size for ${line.label}`}
                            />
                          </label>
                        </div>
                      </div>
                      <textarea
                        id={`generated-text-line-${line.index}`}
                        value={line.text}
                        onChange={(event) => updateGeneratedTextLine(line.index, { text: event.target.value })}
                        className={`${fieldClass} mt-2 min-h-[72px] resize-y px-3 py-2 text-sm leading-5`}
                        aria-label={`Text for line ${line.index + 1}`}
                      />
                      <div className="mt-2">
                        <select
                          value={line.fontFamily}
                          onChange={(event) => updateGeneratedTextLine(line.index, { fontFamily: event.target.value })}
                          className={`${fieldClass} min-h-[42px] px-3 py-2 text-sm`}
                        >
                          {AVAILABLE_FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </div>
                    </div>
                  )) : (
                    <div className="text-sm leading-6 text-[#aab8b0]">Generate a layout first, then each line will appear here.</div>
                  )}
                </div>
                </div>
              )}
              <button onClick={onClear} className="min-h-[48px] w-full rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 py-3 text-sm font-black text-[#ff9b7c]">
                Clear inscription layout
              </button>
            </div>
          )}
        </section>
      )}

      {activeStep === 6 && (
        <section className="space-y-4">
          <div className={`rounded-lg border p-4 text-sm leading-6 ${
            isProductionReady
              ? 'border-[#2f7f69]/35 bg-[#151f1b] text-[#1f755f]'
              : 'border-[#c6932e]/45 bg-[#221d12] text-[#e8c875]'
          }`}>
            <div className="font-black">{isProductionReady ? 'Your proof is ready' : 'Finish these steps before adding to basket'}</div>
            {isProductionReady ? (
              <p className="mt-1">The inscription layout and required portrait artwork are ready for your final review.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {readinessItems.filter(item => !item.ready).map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={() => onGoToStep(item.step)}
                      className="w-full rounded-lg border border-[#c6932e]/45 bg-[#efe4d1] px-3 py-2 text-left text-xs font-black text-[#e8c875] transition hover:bg-[#fffaf0]"
                    >
                      {item.label} <span aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Final fine tune</div>
                <p className="mt-1 text-sm leading-6 text-[#6a746d]">
                  Adjust the proof without regenerating the portrait or text layout.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setFineTuneUnlocked((unlocked) => !unlocked)}
                  className={`min-h-[42px] rounded-full border px-4 text-xs font-black transition ${
                    fineTuneUnlocked
                      ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]'
                      : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832]'
                  }`}
                >
                  {fineTuneUnlocked ? 'Lock fine tune' : 'Unlock fine tune'}
                </button>
                <button
                  onClick={() => onChange({
                    memorialImageScale: state.memorialImageEnabled ? 1.75 : 1,
                    memorialImageZoom: 1,
                    memorialImageOffsetX: 0,
                    memorialImageOffsetY: 0,
                    inscriptionScale: 1,
                    inscriptionOffsetX: 0,
                    inscriptionOffsetY: 0,
                    safeMargin: DEFAULT_SAFE_MARGIN_PERCENT,
                  })}
                  className="min-h-[42px] rounded-full border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 text-xs font-black text-[#2f3832]"
                >
                  Reset
                </button>
              </div>
            </div>
            {!fineTuneUnlocked && (
              <div className="mt-4 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] p-3 text-xs font-bold leading-5 text-[#6a746d]">
                Fine tune is locked so the proof does not shift while scrolling. Unlock it before changing safe margin, picture, or text placement.
              </div>
            )}

            <div className="mt-4 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Safe margin</div>
                  <div className="mt-1 text-sm font-black text-[#9a6a16]">
                    {safeMarginPercent}% · {Math.round(safeMarginMm)}mm from edge
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-black">
                  {SAFE_MARGIN_PRESETS.map(({ label, percent }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!fineTuneUnlocked}
                      onClick={() => onChange({ safeMargin: percent })}
                      className={`min-h-[34px] rounded-full border px-2 transition disabled:opacity-40 ${
                        safeMarginPercent === percent
                          ? 'border-[#c6932e] bg-[#f2d688] text-[#1b231f]'
                          : 'border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] text-[#2f3832]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min="6"
                max="30"
                value={safeMarginPercent}
                disabled={!fineTuneUnlocked}
                onChange={(event) => onChange({ safeMargin: Number(event.target.value) })}
                className="mt-3 w-full accent-[#b98235] disabled:opacity-30"
                aria-label="Safe margin for text and portrait artwork"
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <FineTuneControl
                label="Picture scale"
                valueLabel={`${Math.round(state.memorialImageScale * 100)}%`}
                value={Math.round(state.memorialImageScale * 100)}
                min={5}
                max={1500}
                step={5}
                disabled={!state.memorialImageEnabled}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ memorialImageScale: value / 100 })}
              />
              <FineTuneControl
                label="Picture crop zoom"
                valueLabel={`${Math.round(state.memorialImageZoom * 100)}%`}
                value={Math.round(state.memorialImageZoom * 100)}
                min={5}
                max={1500}
                step={5}
                disabled={!state.memorialImageEnabled}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ memorialImageZoom: value / 100 })}
              />
              <FineTuneControl
                label="Text scale"
                valueLabel={`${Math.round(state.inscriptionScale * 100)}%`}
                value={Math.round(state.inscriptionScale * 100)}
                min={40}
                max={250}
                step={5}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ inscriptionScale: value / 100 })}
              />
              <FineTuneControl
                label="Picture left/right"
                valueLabel={`${state.memorialImageOffsetX}mm`}
                value={state.memorialImageOffsetX}
                min={-pictureOffsetXLimit}
                max={pictureOffsetXLimit}
                step={1}
                disabled={!state.memorialImageEnabled}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ memorialImageOffsetX: value })}
              />
              <FineTuneControl
                label="Text left/right"
                valueLabel={`${state.inscriptionOffsetX}mm`}
                value={state.inscriptionOffsetX}
                min={-30}
                max={30}
                step={1}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ inscriptionOffsetX: value })}
              />
              <FineTuneControl
                label="Picture up/down"
                valueLabel={`${state.memorialImageOffsetY}mm`}
                value={state.memorialImageOffsetY}
                min={-pictureOffsetYLimit}
                max={pictureOffsetYLimit}
                step={1}
                disabled={!state.memorialImageEnabled}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ memorialImageOffsetY: value })}
              />
              <FineTuneControl
                label="Text up/down"
                valueLabel={`${state.inscriptionOffsetY}mm`}
                value={state.inscriptionOffsetY}
                min={-30}
                max={30}
                step={1}
                locked={!fineTuneUnlocked}
                onChange={(value) => onChange({ inscriptionOffsetY: value })}
              />
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Customer proof</div>
            <p className="mt-1 text-sm leading-6 text-[#6a746d]">
              Save your progress, check a realistic preview, or download a review copy.
            </p>
            <div className="mt-4 rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#f6efe2] p-3">
              <label className="block text-xs font-black uppercase tracking-wide text-[#6a746d]">
                Realistic scene prompt
              </label>
              <textarea
                value={realisticPreviewPrompt}
                onChange={(event) => onRealisticPreviewPromptChange(event.target.value)}
                placeholder="Example: luxury garden memorial hero image at golden hour, plaque mounted on natural stone, shallow depth of field, room for website headline on the left."
                className="mt-2 min-h-[112px] w-full resize-y rounded-lg border border-[rgba(84, 72, 52, 0.16)] bg-[#fffaf0] px-3 py-3 text-sm leading-6 text-[#1b231f] outline-none transition focus:border-[#c6932e] focus:ring-4 focus:ring-[#b98235]/20"
              />
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-[#6a746d]">
                  Ratio
                  <select
                    value={realisticPreviewAspectRatio}
                    onChange={(event) => onRealisticPreviewAspectRatioChange(event.target.value)}
                    className="min-h-[44px] rounded-lg border border-[rgba(84, 72, 52, 0.16)] bg-[#fffaf0] px-3 text-sm font-black normal-case tracking-normal text-[#1b231f] outline-none focus:border-[#c6932e] focus:ring-4 focus:ring-[#b98235]/20"
                  >
                    {REALISTIC_ASPECT_RATIOS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label} ({value})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex min-h-[44px] items-end pb-2 text-xs font-black uppercase tracking-wide text-[#9a6a16]">
                  4K
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={onSaveProof} className="min-h-[52px] rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 text-sm font-black text-[#2f3832]">
                Save proof
              </button>
              <button onClick={onRealisticPreview} className="col-span-2 min-h-[52px] rounded-lg bg-[#b98235] px-4 text-sm font-black text-[#1b231f]">
                Realistic preview
              </button>
              <button onClick={onExportPdf} className="min-h-[52px] rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 text-sm font-black text-[#2f3832]">
                Review PDF
              </button>
              <button onClick={onPrint} className="min-h-[52px] rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 text-sm font-black text-[#2f3832]">
                Print
              </button>
            </div>
          </div>

          <details className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
            <summary className="cursor-pointer text-sm font-black text-[#6a746d]">Production file for our workshop</summary>
            <p className="mt-2 text-xs leading-5 text-[#6a746d]">
              Workshop handoff file. Most customers will not need this download.
            </p>
            <button onClick={onExportSvg} className="mt-3 min-h-[48px] w-full rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] px-4 text-sm font-black text-[#2f3832]">
              Download workshop SVG
            </button>
          </details>

          <button
            onClick={onAddToBasket}
            disabled={!isProductionReady}
            className="studio-press min-h-[56px] w-full rounded-lg bg-[#f2d688] px-5 text-sm font-black text-[#1b231f] shadow-[0_14px_34px_rgba(216,177,95,0.18)] disabled:cursor-not-allowed disabled:bg-[#d8ceb9] disabled:text-[#8d8371] disabled:shadow-none"
          >
            {basketAdded ? 'Added to basket' : isProductionReady ? 'Add to basket' : 'Complete the checklist to add to basket'}
          </button>

          {basketAdded && (
            <div className="rounded-lg border border-[#2f7f69]/35 bg-[#151f1b] p-4 text-sm font-bold leading-6 text-[#1f755f]">
              Added to basket. This prototype now reaches a clear handoff point; checkout can be connected later.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Size</div>
              <div className="mt-1 text-lg font-black">{state.width} x {state.height}mm</div>
            </div>
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Estimate</div>
              <div className="mt-1 text-lg font-black">£{price}.00</div>
            </div>
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Wood</div>
              <div className="mt-1 text-lg font-black">{state.wood ? `+${formatPrice(woodAddOnPrice)}` : 'None'}</div>
            </div>
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[#6a746d]">Layout</div>
              <div className="mt-1 text-lg font-black">{state.generatedSvgContent ? 'Fitted' : 'Draft'}</div>
            </div>
          </div>

          {state.aiReasoning && (
            <div className="rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-4 text-sm italic leading-6 text-[#6a746d]">
              {state.aiReasoning}
            </div>
          )}

          {state.conceptImageUrl && (
            <div className="overflow-hidden rounded-lg border border-[rgba(84, 72, 52, 0.14)] bg-[#fffaf0] p-2">
              <img src={state.conceptImageUrl} alt="AI design concept" className="h-auto w-full rounded-lg object-contain" />
            </div>
          )}
        </section>
      )}
    </div>
  );
};
