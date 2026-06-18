import { MemorialImagePlacement, PlaqueState, Shape } from "../types";
import { getSafeMarginMm } from "./safeMargin";

export interface InscriptionLayout {
  textCx: number;
  textCy: number;
  textW: number;
  textH: number;
  artX: number;
  artY: number;
  artW: number;
  artH: number;
  profile: "text-only" | "balanced" | "text-heavy" | "art-focus";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getTextDemand(inscription: string) {
  const normalized = inscription.replace(/\s+/g, " ").trim();
  const explicitLines = inscription.split(/\n+/).map(line => line.trim()).filter(Boolean).length;
  return {
    characters: normalized.length,
    explicitLines,
    targetTextShare: clamp(0.44 + normalized.length / 720 + Math.max(0, explicitLines - 2) * 0.018, 0.46, 0.86),
  };
}

function pickStackedArtShare(inscription: string, isFocus: boolean) {
  const demand = getTextDemand(inscription);
  const candidates = isFocus
    ? [
        { profile: "art-focus" as const, artShare: 0.58 },
        { profile: "balanced" as const, artShare: 0.50 },
        { profile: "text-heavy" as const, artShare: 0.42 },
      ]
    : [
        { profile: "balanced" as const, artShare: 0.50 },
        { profile: "text-heavy" as const, artShare: 0.40 },
        { profile: "text-heavy" as const, artShare: 0.30 },
        { profile: "text-heavy" as const, artShare: 0.22 },
        { profile: "text-heavy" as const, artShare: 0.14 },
      ];

  return candidates.reduce((best, candidate) => {
    const textShare = 1 - candidate.artShare;
    const legibilityScore = 1 - Math.abs(textShare - demand.targetTextShare);
    const artworkScore = 1 - Math.abs(candidate.artShare - (isFocus ? 0.58 : 0.48));
    const score = legibilityScore * 0.78 + artworkScore * 0.22;
    return score > best.score ? { ...candidate, score } : best;
  }, { ...candidates[0], score: Number.NEGATIVE_INFINITY });
}

function pickSideArtShare(inscription: string) {
  const demand = getTextDemand(inscription);
  const targetTextShare = clamp(demand.targetTextShare + 0.08, 0.52, 0.72);
  const candidates = [
    { profile: "balanced" as const, artShare: 0.46 },
    { profile: "text-heavy" as const, artShare: 0.38 },
    { profile: "text-heavy" as const, artShare: 0.30 },
  ];

  return candidates.reduce((best, candidate) => {
    const textShare = 1 - candidate.artShare;
    const legibilityScore = 1 - Math.abs(textShare - targetTextShare);
    const artworkScore = 1 - Math.abs(candidate.artShare - 0.46);
    const score = legibilityScore * 0.82 + artworkScore * 0.18;
    return score > best.score ? { ...candidate, score } : best;
  }, { ...candidates[0], score: Number.NEGATIVE_INFINITY });
}

export function getInscriptionLayout(
  state: PlaqueState,
  inscription = "",
  options: { unrestrictedArtwork?: boolean } = {},
): InscriptionLayout {
  const woodExtra = state.wood ? 25 : 0;
  const offset = woodExtra / 2;
  const cx = offset + state.width / 2;
  const cy = offset + state.height / 2;
  const safeMargin = getSafeMarginMm({
    width: state.width,
    height: state.height,
    shape: state.shape,
    safeMargin: state.safeMargin,
  });
  const safeX = offset + safeMargin;
  const safeY = offset + safeMargin;
  const safeW = Math.max(10, state.width - safeMargin * 2);
  const safeH = Math.max(10, state.height - safeMargin * 2);

  if (!state.memorialImageEnabled) {
    return { textCx: cx, textCy: cy, textW: safeW, textH: safeH, artX: 0, artY: 0, artW: 0, artH: 0, profile: "text-only" };
  }

  const ratio = state.width / Math.max(1, state.height);
  const gap = Math.max(8, Math.min(state.width, state.height) * 0.05);
  const isAbove = state.memorialImagePlacement === MemorialImagePlacement.AboveText;
  const isFocus = state.memorialImagePlacement === MemorialImagePlacement.PortraitFocus;
  const useStacked = state.shape !== Shape.Rect || ratio < 0.95 || isAbove || isFocus;
  const portraitScale = Math.max(options.unrestrictedArtwork ? 0.01 : 0.1, state.memorialImageScale);

  if (state.shape === Shape.Heart) {
    const baseArtH = Math.max(12, state.height * 0.34);
    const baseArtW = Math.min(state.width * 0.46, safeW);
    const artH = options.unrestrictedArtwork ? baseArtH * portraitScale : Math.max(12, state.height * 0.34 * portraitScale);
    const artW = options.unrestrictedArtwork ? baseArtW * portraitScale : Math.min(state.width * 0.46 * portraitScale, safeW);
    const textH = Math.max(18, state.height * 0.24);
    const artCx = cx;
    const artCy = offset + state.height * 0.20 + baseArtH / 2;
    return {
      textCx: cx,
      textCy: offset + state.height * 0.71,
      textW: state.width * 0.50,
      textH,
      artX: artCx - artW / 2,
      artY: artCy - artH / 2,
      artW,
      artH,
      profile: "art-focus",
    };
  }

  if (useStacked) {
    const allocation = pickStackedArtShare(inscription, isFocus);
    const stackedGap = inscription.replace(/\s+/g, " ").trim().length > 180
      ? Math.max(4, Math.min(gap, Math.min(state.width, state.height) * 0.025))
      : gap;
    const baseArtH = Math.max(8, Math.min(safeH - stackedGap - 18, safeH * allocation.artShare));
    const baseArtW = safeW;
    const artH = options.unrestrictedArtwork
      ? Math.max(1, baseArtH * portraitScale)
      : Math.max(8, Math.min(safeH - stackedGap - 18, safeH * allocation.artShare * portraitScale));
    const artW = options.unrestrictedArtwork
      ? Math.max(1, baseArtW * portraitScale)
      : Math.min(safeW * portraitScale, safeW);
    const remainingH = Math.max(18, safeH - baseArtH - stackedGap);
    const artCx = cx;
    const artCy = safeY + baseArtH / 2;
    return {
      textCx: cx,
      textCy: safeY + baseArtH + stackedGap + remainingH / 2,
      textW: safeW * (isFocus ? 0.88 : 0.98),
      textH: remainingH,
      artX: artCx - artW / 2,
      artY: artCy - artH / 2,
      artW,
      artH,
      profile: allocation.profile,
    };
  }

  const allocation = pickSideArtShare(inscription);
  const sideGap = Math.min(gap, Math.max(4, safeW * 0.08));
  const sideW = Math.max(12, (safeW - sideGap) / 2);
  const leftCx = safeX + sideW / 2;
  const rightCx = safeX + sideW + sideGap + sideW / 2;
  const baseArtW = sideW;
  const baseArtH = Math.min(safeH * 0.86, baseArtW * 1.2, safeH);
  const artW = options.unrestrictedArtwork
    ? Math.max(1, baseArtW * portraitScale)
    : Math.max(8, Math.min(sideW * portraitScale, sideW));
  const artH = options.unrestrictedArtwork
    ? Math.max(1, baseArtH * portraitScale)
    : Math.min(safeH * 0.86 * portraitScale, artW * 1.2, safeH);
  const textW = Math.max(20, sideW);
  const portraitOnRight = state.memorialImagePlacement === MemorialImagePlacement.PortraitRight;
  const artCx = portraitOnRight ? rightCx : leftCx;
  const textCx = portraitOnRight ? leftCx : rightCx;
  return {
    textCx,
    textCy: cy,
    textW,
    textH: safeH * 0.92,
    artX: artCx - artW / 2,
    artY: cy - artH / 2,
    artW,
    artH,
    profile: allocation.profile,
  };
}
