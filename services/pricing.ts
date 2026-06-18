import { Material, PlaqueState, Shape } from '../types';

type PricingMaterial = 'stainless' | 'brass' | 'bronzed-brass';

interface PricingBand {
  id: 'a5' | 'a4' | 'stable-300x200' | 'statement-400x300';
  maxArea: number;
  woodAddOn: number;
}

const PACKAGE_AND_POSTAGE = 12.5;
const MM_PER_INCH = 25.4;
const SUPPLIER_VAT_RATE = 0.2;
const TARGET_GROSS_MARGIN = 0.4;
const SHAPED_PLAQUE_CUTTING_UPLIFT = 1.04;
const PRODUCTION_BED_WIDTH = 610;
const PRODUCTION_BED_HEIGHT = 420;
const OVERSIZED_BED_UPLIFT = 1.25;

const PRICING_BANDS: PricingBand[] = [
  {
    id: 'a5',
    maxArea: 210 * 148,
    woodAddOn: 69,
  },
  {
    id: 'a4',
    maxArea: 297 * 210,
    woodAddOn: 99,
  },
  {
    id: 'stable-300x200',
    maxArea: 300 * 200,
    woodAddOn: 99,
  },
  {
    id: 'statement-400x300',
    maxArea: 400 * 300,
    woodAddOn: 169,
  },
];

function getPricingMaterial(material: Material): PricingMaterial {
  if (material === Material.AgedBrass) return 'bronzed-brass';
  if (
    material === Material.BrushedBrass ||
    material === Material.OrbitalBrassMattLacquer ||
    material === Material.PolishedBrass ||
    material === Material.PolishedSteel
  ) {
    return 'brass';
  }
  return 'stainless';
}

function getPricingBand(state: PlaqueState) {
  const area = state.width * state.height;
  const normalizedWidth = Math.max(state.width, state.height);
  const normalizedHeight = Math.min(state.width, state.height);

  if (normalizedWidth === 300 && normalizedHeight === 200) {
    return PRICING_BANDS.find((band) => band.id === 'stable-300x200')!;
  }

  if (normalizedWidth === 400 && normalizedHeight === 300) {
    return PRICING_BANDS.find((band) => band.id === 'statement-400x300')!;
  }

  return PRICING_BANDS.find((band) => area <= band.maxArea) ?? PRICING_BANDS[PRICING_BANDS.length - 1];
}

function roundUpToNine(value: number) {
  return Math.ceil((value + 1) / 10) * 10 - 1;
}

function getTradeEtchedCost(state: PlaqueState, material: PricingMaterial) {
  const areaInches = (state.width / MM_PER_INCH) * (state.height / MM_PER_INCH);
  const etchedBase = areaInches * 0.4;
  const jfkStainless = etchedBase + 10;
  const jfkMirrorBrass = jfkStainless * 1.177;
  const jfkBronzedBrass = jfkMirrorBrass * 1.15;

  if (material === 'stainless') return jfkStainless * 1.155 * 1.1;
  if (material === 'brass') return jfkMirrorBrass * 1.115 * 1.1;
  return jfkBronzedBrass * 1.115 * 1.1;
}

function getShapeUplift(shape: Shape) {
  return shape === Shape.Oval || shape === Shape.Circle ? SHAPED_PLAQUE_CUTTING_UPLIFT : 1;
}

export function fitsProductionBed(state: Pick<PlaqueState, 'width' | 'height'>) {
  return (state.width <= PRODUCTION_BED_WIDTH && state.height <= PRODUCTION_BED_HEIGHT)
    || (state.width <= PRODUCTION_BED_HEIGHT && state.height <= PRODUCTION_BED_WIDTH);
}

export function estimatePlaquePrice(state: PlaqueState) {
  const band = getPricingBand(state);
  const material = getPricingMaterial(state.material);
  const supplierCostWithVat = getTradeEtchedCost(state, material) * getShapeUplift(state.shape) * (1 + SUPPLIER_VAT_RATE);
  const costBasis = supplierCostWithVat + PACKAGE_AND_POSTAGE;
  const baseRetail = costBasis / (1 - TARGET_GROSS_MARGIN);
  const plaqueRetail = roundUpToNine(fitsProductionBed(state) ? baseRetail : baseRetail * OVERSIZED_BED_UPLIFT);
  const woodAddOn = state.wood && state.shape !== Shape.Heart ? band.woodAddOn : 0;

  return plaqueRetail + woodAddOn;
}

export function estimatePlaqueBasePrice(state: PlaqueState) {
  return estimatePlaquePrice({ ...state, wood: false });
}

export function estimateWoodAddOn(state: PlaqueState) {
  if (state.shape === Shape.Heart) return 0;
  return estimatePlaquePrice({ ...state, wood: true }) - estimatePlaqueBasePrice(state);
}
