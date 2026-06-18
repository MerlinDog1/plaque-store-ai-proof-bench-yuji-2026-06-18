import React, { RefObject, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Fixing, Material, PlaqueState, Shape } from '../types';
import { outlinePreviewTextLayer } from '../services/exportService';

interface Props {
  state: PlaqueState;
  activeStep: number;
  inscription: string;
  sourceSvgRef: RefObject<SVGSVGElement | null>;
}

type ThreeHost = HTMLDivElement & {
  __scene?: THREE.Scene;
  __plaqueGroup?: THREE.Group;
  __camera?: THREE.PerspectiveCamera;
};

const WOOD_BACKING_OVERHANG_MM = 12.5;
const WOOD_BACKING_EXTRA_MM = WOOD_BACKING_OVERHANG_MM * 2;
const METAL_THICKNESS_MM = 1.5;
const WOOD_BACKING_THICKNESS_MM = 15;
const WOOD_BACKING_BEVEL_SIZE_MM = 8.4;
const WOOD_BACKING_BEVEL_THICKNESS_MM = 5.25;
const CAP_THICKNESS_MM = 2;
const SCENE_PLAQUE_WIDTH = 3.4;

type TextureCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const faceTextureCanvasCache = new Map<string, HTMLCanvasElement>();
const woodImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function rememberFaceTextureCanvas(key: string | undefined, canvas: HTMLCanvasElement, fontsOutlined = false) {
  if (!key) return;
  (canvas as HTMLCanvasElement & { __fontsOutlined?: boolean }).__fontsOutlined = fontsOutlined;
  faceTextureCanvasCache.set(key, canvas);
  if (faceTextureCanvasCache.size > 8) {
    const oldest = faceTextureCanvasCache.keys().next().value;
    if (oldest) faceTextureCanvasCache.delete(oldest);
  }
}

const materialTone: Record<Material, { face: number; side: number; roughness: number; metalness: number }> = {
  [Material.BrushedBrass]: { face: 0xb98632, side: 0x6f4315, roughness: 0.48, metalness: 0.82 },
  [Material.OrbitalBrassMattLacquer]: { face: 0xa98d50, side: 0x675534, roughness: 0.74, metalness: 0.55 },
  [Material.PolishedBrass]: { face: 0xd49a25, side: 0x6d3d09, roughness: 0.22, metalness: 0.92 },
  [Material.AgedBrass]: { face: 0x76613a, side: 0x332716, roughness: 0.72, metalness: 0.66 },
  [Material.BrushedSteel]: { face: 0xaeb8be, side: 0x5c666d, roughness: 0.42, metalness: 0.9 },
  [Material.PolishedSteel]: { face: 0xd9e0e4, side: 0x4b555e, roughness: 0.16, metalness: 0.96 },
};

const stepFaceText: Record<number, string[]> = {
  0: ['CHOOSE MATERIAL', 'BRASS OR STEEL FINISH'],
  1: ['CHOOSE YOUR', 'SIZE AND SHAPE'],
  2: ['CHOOSE COLOUR', 'SET THE ENGRAVING CONTRAST'],
  3: ['BORDER / FIXINGS', 'CHOOSE MOUNTING'],
  4: ['WOOD BACKING', 'OPTIONAL TIMBER BOARD'],
  5: ['CHOOSE YOUR', 'TEXT AND LAYOUT'],
  6: ['REVIEW PROOF', 'SAVE OR ADD TO BASKET'],
};

function hexToCss(value: number) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function makeFaceTexture(state: PlaqueState, activeStep: number, inscription: string, tone: { face: number; side: number }) {
  const width = 1400;
  const height = Math.max(420, Math.round(width * (state.height / Math.max(1, state.width))));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const base = hexToCss(tone.face);
  const shadow = hexToCss(tone.side);
  const gradient = ctx.createLinearGradient(0, 0, width, height * 0.18);
  gradient.addColorStop(0, shadow);
  gradient.addColorStop(0.32, base);
  gradient.addColorStop(0.55, state.material === Material.PolishedSteel ? '#f7fbff' : '#d0a459');
  gradient.addColorStop(0.82, base);
  gradient.addColorStop(1, shadow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = state.material === Material.OrbitalBrassMattLacquer ? 0.1 : 0.16;
  ctx.strokeStyle = state.material.includes('stainless') ? '#ffffff' : '#ffe3a0';
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 9) {
    ctx.beginPath();
    ctx.moveTo(0, y + (Math.sin(y * 0.03) * 2));
    ctx.lineTo(width, y + (Math.sin(y * 0.03) * 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const textColour = state.reverseEtch ? base : '#24180b';
  const lines = inscription.trim()
    ? inscription.trim().split(/\r?\n/).filter(Boolean).slice(0, 5)
    : stepFaceText[activeStep] || stepFaceText[0];
  const mainSize = inscription.trim() ? Math.max(54, Math.min(110, height / (lines.length + 2.2))) : Math.max(56, Math.min(96, height / 5.8));
  ctx.fillStyle = textColour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = state.reverseEtch ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.22)';
  ctx.shadowBlur = 1.5;

  const centerY = height / 2;
  lines.forEach((line, index) => {
    const isTitle = !inscription.trim() && index === 0;
    ctx.font = `${isTitle ? 800 : 700} ${isTitle ? mainSize * 0.76 : mainSize}px Georgia, 'Times New Roman', serif`;
    const y = centerY + (index - (lines.length - 1) / 2) * mainSize * 1.16;
    ctx.fillText(line.toUpperCase(), width / 2, y, width * 0.76);
  });
  ctx.shadowBlur = 0;

  if (state.border) {
    const inset = width * 0.04;
    ctx.strokeStyle = textColour;
    ctx.lineWidth = Math.max(3, width * 0.003);
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    if (state.borderStyle.includes('double')) {
      const inner = inset * 1.7;
      ctx.globalAlpha = 0.78;
      ctx.strokeRect(inner, inner, width - inner * 2, height - inner * 2);
      ctx.globalAlpha = 1;
    }
  }

  if (state.fixing === 'screws' || state.fixing === 'caps') {
    const inset = width * 0.06;
    const radius = state.fixing === 'caps' ? width * 0.025 : width * 0.016;
    const points = [[inset, inset], [width - inset, inset], [width - inset, height - inset], [inset, height - inset]];
    const metal = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
    metal.addColorStop(0, '#ffffff');
    metal.addColorStop(0.42, '#bfc7cc');
    metal.addColorStop(1, '#4b5359');
    points.forEach(([x, y]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

async function fileToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not inline preview image asset.'));
    reader.readAsDataURL(blob);
  });
}

async function inlineSvgImageAssets(svg: SVGSVGElement) {
  const images = Array.from(svg.querySelectorAll('image'));
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute('href') || image.getAttribute('xlink:href') || '';
    if (!href || href.startsWith('data:')) return;
    const absoluteUrl = href.startsWith('/') ? `${window.location.origin}${href}` : href;
    try {
      const response = await fetch(absoluteUrl);
      if (!response.ok) return;
      image.setAttribute('href', await fileToDataUrl(await response.blob()));
      image.removeAttribute('xlink:href');
    } catch {
      image.setAttribute('href', absoluteUrl);
    }
  }));
}

function pruneWoodBackingFromProofTexture(svg: SVGSVGElement) {
  svg.querySelector('.wood-backing')?.remove();
  svg.querySelector('#woodDarkTexture')?.remove();
  svg.querySelector('#woodLightTexture')?.remove();
}

function getSvgViewBox(svg: SVGSVGElement) {
  const box = svg.viewBox.baseVal;
  if (box?.width && box?.height) return { width: box.width, height: box.height };
  return {
    width: Number(svg.getAttribute('width')) || 300,
    height: Number(svg.getAttribute('height')) || 200,
  };
}

function inlineComputedSvgStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll('*'))] as Element[];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))] as Element[];
  const inheritedPaint = new Set(['text', 'tspan', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g']);

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode || !(sourceNode instanceof SVGElement)) return;
    const computed = window.getComputedStyle(sourceNode);

    if (inheritedPaint.has(sourceNode.tagName.toLowerCase())) {
      const fill = computed.fill;
      const stroke = computed.stroke;
      if (fill && fill !== 'none' && !fill.startsWith('url(')) cloneNode.setAttribute('fill', fill);
      if (stroke && stroke !== 'none' && !stroke.startsWith('url(')) cloneNode.setAttribute('stroke', stroke);
      if (computed.opacity && computed.opacity !== '1') cloneNode.setAttribute('opacity', computed.opacity);
    }

    if (sourceNode instanceof SVGTextElement || sourceNode instanceof SVGTSpanElement) {
      cloneNode.setAttribute('font-family', computed.fontFamily);
      cloneNode.setAttribute('font-size', computed.fontSize);
      cloneNode.setAttribute('font-weight', computed.fontWeight);
      cloneNode.setAttribute('font-style', computed.fontStyle);
      cloneNode.setAttribute('letter-spacing', computed.letterSpacing);
      cloneNode.setAttribute('text-anchor', computed.getPropertyValue('text-anchor'));
    }
  });
}

function makeWoodTexture(tone: PlaqueState['woodTone']) {
  const texturePath = tone === 'dark'
    ? '/materials/wood-dark-mahogany-veneer.webp'
    : '/materials/wood-light-oak-veneer.webp';

  if (!woodImageCache.has(texturePath)) {
    woodImageCache.set(texturePath, new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = texturePath;
    }));
  }

  return woodImageCache.get(texturePath)!.then((image) => {
    if (!image) return makeFallbackWoodTexture(tone);
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  });
}

function makeFallbackWoodTexture(tone: PlaqueState['woodTone']) {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const base = tone === 'dark' ? '#4a2a15' : '#b8793d';
  const warm = tone === 'dark' ? '#6a3d1f' : '#d19858';
  const shadow = tone === 'dark' ? '#241108' : '#7c4a24';
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, shadow);
  gradient.addColorStop(0.18, base);
  gradient.addColorStop(0.52, warm);
  gradient.addColorStop(0.85, base);
  gradient.addColorStop(1, shadow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < height; y += 3) {
    const wave = Math.sin(y * 0.045) * 8 + Math.sin(y * 0.013) * 18;
    ctx.globalAlpha = 0.11 + (Math.sin(y * 0.09) + 1) * 0.035;
    ctx.strokeStyle = y % 9 === 0 ? '#f2c17c' : '#2b1609';
    ctx.lineWidth = y % 11 === 0 ? 1.6 : 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y + wave * 0.18);
    for (let x = 0; x <= width; x += 32) {
      const grain = Math.sin((x + y * 1.7) * 0.017) * 3 + Math.sin((x - y) * 0.043) * 1.2;
      ctx.lineTo(x, y + wave * 0.18 + grain);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

async function makeSvgFaceTexture(sourceSvg: SVGSVGElement, crop?: TextureCrop, cacheKey?: string) {
  const cachedCanvas = cacheKey ? faceTextureCanvasCache.get(cacheKey) : undefined;
  if (cachedCanvas) {
    const texture = new THREE.CanvasTexture(cachedCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.userData.cacheHit = true;
    texture.userData.fontsOutlined = Boolean((cachedCanvas as HTMLCanvasElement & { __fontsOutlined?: boolean }).__fontsOutlined);
    return texture;
  }

  await document.fonts?.ready;
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  const viewBox = getSvgViewBox(sourceSvg);
  const cropBox = crop || { x: 0, y: 0, width: viewBox.width, height: viewBox.height };
  const pixelWidth = crop ? 1900 : 1500;
  const sourcePixelWidth = Math.max(
    pixelWidth,
    Math.round(pixelWidth * (viewBox.width / Math.max(1, cropBox.width))),
  );
  const sourcePixelHeight = Math.max(420, Math.round(sourcePixelWidth * (viewBox.height / Math.max(1, viewBox.width))));
  const pixelHeight = Math.max(280, Math.round(pixelWidth * (cropBox.height / Math.max(1, cropBox.width))));

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', `${sourcePixelWidth}`);
  clone.setAttribute('height', `${sourcePixelHeight}`);
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  clone.setAttribute('overflow', 'visible');
  inlineComputedSvgStyles(sourceSvg, clone);
  if (crop) pruneWoodBackingFromProofTexture(clone);
  const sourceTextLayer = sourceSvg.querySelector('#ai-text-layer');
  const textFill = sourceTextLayer ? window.getComputedStyle(sourceTextLayer).fill : '';
  let fontsOutlined = false;
  try {
    await outlinePreviewTextLayer(clone, sourceSvg, {
      pathFill: textFill && textFill !== 'none' ? textFill : undefined,
    });
    fontsOutlined = clone.querySelectorAll('#ai-text-layer path').length > 0;
  } catch (error) {
    console.warn('3D preview could not outline SVG text before rasterizing.', error);
  }
  await inlineSvgImageAssets(clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const imageUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;

  return new Promise<THREE.CanvasTexture>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not rasterize SVG proof for 3D preview.'));
        return;
      }
      ctx.clearRect(0, 0, pixelWidth, pixelHeight);
      const scaleX = sourcePixelWidth / Math.max(1, viewBox.width);
      const scaleY = sourcePixelHeight / Math.max(1, viewBox.height);
      ctx.drawImage(
        image,
        cropBox.x * scaleX,
        cropBox.y * scaleY,
        cropBox.width * scaleX,
        cropBox.height * scaleY,
        0,
        0,
        pixelWidth,
        pixelHeight,
      );
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.userData.cacheHit = false;
      texture.userData.fontsOutlined = fontsOutlined;
      rememberFaceTextureCanvas(cacheKey, canvas, fontsOutlined);
      resolve(texture);
    };
    image.onerror = () => reject(new Error('Could not load SVG proof texture.'));
    image.src = imageUrl;
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
  const materials = Array.isArray(material) ? material : [material];
  materials.filter(Boolean).forEach((entry) => {
    const maybeMapped = entry as THREE.Material & { map?: THREE.Texture };
    maybeMapped.map?.dispose();
    entry?.dispose();
  });
}

function makeShape(state: PlaqueState, width: number, height: number) {
  const shape = new THREE.Shape();

  if (state.shape === Shape.Oval || state.shape === Shape.Circle) {
    const rx = width / 2;
    const ry = state.shape === Shape.Circle ? rx : height / 2;
    shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    return { shape, width, height: ry * 2 };
  }

  if (state.shape === Shape.Heart) {
    const w = width;
    const h = height;
    shape.moveTo(0, -h * 0.47);
    shape.bezierCurveTo(-w * 0.28, -h * 0.28, -w * 0.48, -h * 0.08, -w * 0.45, h * 0.18);
    shape.bezierCurveTo(-w * 0.42, h * 0.43, -w * 0.14, h * 0.46, 0, h * 0.24);
    shape.bezierCurveTo(w * 0.14, h * 0.46, w * 0.42, h * 0.43, w * 0.45, h * 0.18);
    shape.bezierCurveTo(w * 0.48, -h * 0.08, w * 0.28, -h * 0.28, 0, -h * 0.47);
    return { shape, width, height };
  }

  const hw = width / 2;
  const hh = height / 2;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();
  return { shape, width, height };
}

function getSceneDimensions(state: PlaqueState) {
  const unitPerMm = SCENE_PLAQUE_WIDTH / Math.max(1, state.width);
  const plaqueWidth = state.width * unitPerMm;
  const plaqueHeight = state.height * unitPerMm;
  const totalWidthMm = state.width + (state.wood ? WOOD_BACKING_EXTRA_MM : 0);
  const totalHeightMm = state.height + (state.wood ? WOOD_BACKING_EXTRA_MM : 0);
  return {
    unitPerMm,
    plaqueWidth,
    plaqueHeight,
    totalWidth: totalWidthMm * unitPerMm,
    totalHeight: totalHeightMm * unitPerMm,
    metalDepth: METAL_THICKNESS_MM * unitPerMm,
    woodDepth: WOOD_BACKING_THICKNESS_MM * unitPerMm,
    capDepth: CAP_THICKNESS_MM * unitPerMm,
    totalWidthMm,
    totalHeightMm,
  };
}

function makeExtrudedMesh(
  shape: THREE.Shape,
  depth: number,
  material: THREE.Material,
  bevelSize: number,
  bevelThickness: number,
  bevelEnabled = true,
) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled,
    bevelThickness,
    bevelSize,
    bevelSegments: bevelEnabled ? 3 : 0,
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
}

function makeRectFrontChamferedWoodMesh(
  dims: ReturnType<typeof getSceneDimensions>,
  material: THREE.Material,
) {
  const halfOuterW = dims.totalWidth / 2;
  const halfOuterH = dims.totalHeight / 2;
  const bevelInset = Math.min(
    WOOD_BACKING_BEVEL_SIZE_MM * dims.unitPerMm,
    Math.max(0.01, dims.totalWidth / 2 - 0.01),
    Math.max(0.01, dims.totalHeight / 2 - 0.01),
  );
  const bevelDepth = Math.min(WOOD_BACKING_BEVEL_THICKNESS_MM * dims.unitPerMm, dims.woodDepth - 0.01);
  const halfFrontW = Math.max(0.01, halfOuterW - bevelInset);
  const halfFrontH = Math.max(0.01, halfOuterH - bevelInset);
  const zFront = 0;
  const zChamferEnd = -bevelDepth;
  const zBack = -dims.woodDepth;

  const positions = new Float32Array([
    -halfFrontW, -halfFrontH, zFront,
     halfFrontW, -halfFrontH, zFront,
     halfFrontW,  halfFrontH, zFront,
    -halfFrontW,  halfFrontH, zFront,
    -halfOuterW, -halfOuterH, zChamferEnd,
     halfOuterW, -halfOuterH, zChamferEnd,
     halfOuterW,  halfOuterH, zChamferEnd,
    -halfOuterW,  halfOuterH, zChamferEnd,
    -halfOuterW, -halfOuterH, zBack,
     halfOuterW, -halfOuterH, zBack,
     halfOuterW,  halfOuterH, zBack,
    -halfOuterW,  halfOuterH, zBack,
  ]);

  const indices = [
    0, 1, 2, 0, 2, 3,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
    4, 8, 9, 4, 9, 5,
    5, 9, 10, 5, 10, 6,
    6, 10, 11, 6, 11, 7,
    7, 11, 8, 7, 8, 4,
    8, 11, 10, 8, 10, 9,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.frontOnlyChamfer = true;
  return mesh;
}

function makeWoodFaceMesh(state: PlaqueState, dims: ReturnType<typeof getSceneDimensions>, texture: THREE.Texture | null) {
  const bevelInset = state.woodEdge === 'bevel' ? WOOD_BACKING_BEVEL_SIZE_MM * dims.unitPerMm : 0;
  const width = Math.max(0.1, dims.totalWidth - bevelInset * 2);
  const height = Math.max(0.1, dims.totalHeight - bevelInset * 2);
  const material = new THREE.MeshStandardMaterial({
    color: state.woodTone === 'dark' ? 0x4a2a15 : 0xb8793d,
    map: texture || undefined,
    roughness: 0.88,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const geometry = state.shape === Shape.Rect
    ? new THREE.PlaneGeometry(width, height)
    : new THREE.ShapeGeometry(makeShape(state, width, height).shape, 48);
  const face = new THREE.Mesh(geometry, material);
  face.position.z = 0.003;
  face.renderOrder = 1;
  return face;
}

function getFixingPositions(state: PlaqueState) {
  if (state.fixing !== Fixing.Screws && state.fixing !== Fixing.Caps) return [];
  if (state.shape === Shape.Heart) return [];

  const borderOuterInset = 3;
  const fixingBorderClearance = state.fixing === Fixing.Screws ? 0.75 : 2;
  const screwRadius = 2.5;
  const capRadius = state.capSize / 2;
  const fixingRadius = state.fixing === Fixing.Caps ? capRadius : screwRadius;
  const borderFixingInset = borderOuterInset;
  const holeInset = state.border
    ? borderFixingInset + fixingRadius + fixingBorderClearance
    : state.fixing === Fixing.Screws ? 7 : 10 + (state.capSize === 15 ? 2 : 0);
  const sideMountedFixings = state.shape !== Shape.Rect || state.height < 80;
  const offset = state.wood ? WOOD_BACKING_EXTRA_MM / 2 : 0;
  const cx = offset + state.width / 2;
  const cy = offset + state.height / 2;

  if (sideMountedFixings) {
    const xOffset = state.width / 2 - holeInset;
    return [{ x: cx - xOffset, y: cy }, { x: cx + xOffset, y: cy }];
  }

  const x1 = offset + holeInset;
  const x2 = offset + state.width - holeInset;
  const y1 = offset + holeInset;
  const y2 = offset + state.height - holeInset;
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

export const ThreePlaquePreview: React.FC<Props> = ({ state, activeStep, inscription, sourceSvgRef }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, -0.15, 8.6);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c211d, 1.6));
    const keyLight = new THREE.DirectionalLight(0xfff2cc, 3.2);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd9f0ff, 1.8);
    rimLight.position.set(4, -3, 4);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4.4;
    controls.maxDistance = 13;
    controls.target.set(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);
    const threeHost = host as ThreeHost;
    threeHost.__scene = scene;
    threeHost.__plaqueGroup = group;
    threeHost.__camera = camera;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      const fieldOfView = THREE.MathUtils.degToRad(camera.fov);
      const dims = getSceneDimensions(state);
      const shapeWidth = dims.totalWidth;
      const shapeHeight = dims.totalHeight;
      const distanceForHeight = shapeHeight / (2 * Math.tan(fieldOfView / 2));
      const distanceForWidth = shapeWidth / (2 * Math.tan(fieldOfView / 2) * Math.max(0.1, camera.aspect));
      const fittedDistance = Math.max(distanceForHeight, distanceForWidth) * 1.42;
      camera.position.z = THREE.MathUtils.clamp(fittedDistance, 5.1, 12);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -0.18, 0.04);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0.015, 0.04);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      delete threeHost.__scene;
      delete threeHost.__plaqueGroup;
      delete threeHost.__camera;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        disposeMaterial(mesh.material);
      });
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const threeHost = host as ThreeHost;
    const scene = threeHost.__scene;
    const camera = threeHost.__camera;
    const existingGroup = threeHost.__plaqueGroup;
    if (!scene || !existingGroup) return;

    while (existingGroup.children.length) {
      const child = existingGroup.children.pop();
      if (!child) break;
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        disposeMaterial(mesh.material);
      });
    }
    host.dataset.ready = 'false';
    let cancelled = false;

    const dims = getSceneDimensions(state);
    if (camera) {
      const rect = host.getBoundingClientRect();
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      const fieldOfView = THREE.MathUtils.degToRad(camera.fov);
      const distanceForHeight = dims.totalHeight / (2 * Math.tan(fieldOfView / 2));
      const distanceForWidth = dims.totalWidth / (2 * Math.tan(fieldOfView / 2) * Math.max(0.1, camera.aspect));
      camera.position.z = THREE.MathUtils.clamp(Math.max(distanceForHeight, distanceForWidth) * 1.42, 5.1, 12);
      camera.updateProjectionMatrix();
    }

    const tone = materialTone[state.material];

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: tone.side,
      metalness: tone.metalness,
      roughness: Math.min(0.86, tone.roughness + 0.12),
    });

    const metalShape = makeShape(state, dims.plaqueWidth, dims.plaqueHeight).shape;
    const metalBody = makeExtrudedMesh(
      metalShape,
      dims.metalDepth,
      sideMaterial,
      Math.max(0.004, dims.unitPerMm * 0.45),
      Math.max(0.003, dims.unitPerMm * 0.35),
    );
    metalBody.position.z = dims.metalDepth / 2;
    existingGroup.add(metalBody);

    if (state.wood) {
      const woodShape = makeShape(state, dims.totalWidth, dims.totalHeight).shape;
      const woodMaterial = new THREE.MeshStandardMaterial({
        color: state.woodTone === 'dark' ? 0x3d2413 : 0xb47a48,
        roughness: 0.86,
        metalness: 0.02,
      });
      const woodBody = state.woodEdge === 'bevel' && state.shape === Shape.Rect
        ? makeRectFrontChamferedWoodMesh(dims, woodMaterial)
        : makeExtrudedMesh(
            woodShape,
            dims.woodDepth,
            woodMaterial,
            0,
            0,
            false,
          );
      if (!(state.woodEdge === 'bevel' && state.shape === Shape.Rect)) {
        woodBody.position.z = -dims.woodDepth / 2;
      }
      existingGroup.add(woodBody);
      const woodFace = makeWoodFaceMesh(state, dims, null);
      existingGroup.add(woodFace);
      makeWoodTexture(state.woodTone).then((woodTexture) => {
        if (cancelled || !woodTexture) {
          woodTexture?.dispose();
          return;
        }
        const faceMaterial = woodFace.material as THREE.MeshStandardMaterial;
        faceMaterial.map = woodTexture;
        faceMaterial.needsUpdate = true;
        host.dataset.woodTexture = 'scan';
      });
    }

    if (state.fixing === Fixing.Caps || state.fixing === Fixing.Screws) {
      const capMaterial = new THREE.MeshStandardMaterial({
        color: tone.face,
        metalness: tone.metalness,
        roughness: tone.roughness,
      });
      const radiusMm = state.fixing === Fixing.Caps ? state.capSize / 2 : 2.5;
      const hardwareDepth = state.fixing === Fixing.Caps ? dims.capDepth : Math.max(dims.unitPerMm * 0.5, dims.metalDepth * 0.35);
      getFixingPositions(state).forEach((point) => {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(radiusMm * dims.unitPerMm, radiusMm * dims.unitPerMm, hardwareDepth, 40),
          capMaterial,
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.x = (point.x - dims.totalWidthMm / 2) * dims.unitPerMm;
        cap.position.y = -(point.y - dims.totalHeightMm / 2) * dims.unitPerMm;
        cap.position.z = dims.metalDepth + hardwareDepth / 2 + 0.002;
        existingGroup.add(cap);
      });
    }

    const fallbackTexture = () => makeFaceTexture(state, activeStep, inscription, tone);
    const addFace = (texture: THREE.Texture | null, exactProof: boolean) => {
      if (!texture) return;
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const faceMaterial = exactProof
        ? new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          })
        : new THREE.MeshStandardMaterial({
            color: tone.face,
            metalness: tone.metalness,
            roughness: tone.roughness,
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(dims.plaqueWidth, dims.plaqueHeight), faceMaterial);
      face.position.z = dims.metalDepth + Math.max(0.012, dims.unitPerMm * 0.35);
      face.renderOrder = 4;
      face.userData.previewFace = exactProof ? 'svg' : 'fallback';
      existingGroup.add(face);
      host.dataset.ready = 'true';
      host.dataset.texture = exactProof ? 'svg' : 'fallback';
      host.dataset.faceTextureCache = texture.userData.cacheHit ? 'hit' : 'miss';
      host.dataset.fontsOutlined = texture.userData.fontsOutlined ? 'true' : 'false';
      host.dataset.metalThicknessMm = String(METAL_THICKNESS_MM);
      host.dataset.woodThicknessMm = state.wood ? String(WOOD_BACKING_THICKNESS_MM) : '0';
      host.dataset.woodOverhangMm = state.wood ? String(WOOD_BACKING_OVERHANG_MM) : '0';
      host.dataset.woodEdge = state.wood ? state.woodEdge : 'none';
      host.dataset.woodBevelSizeMm = state.wood && state.woodEdge === 'bevel' ? String(WOOD_BACKING_BEVEL_SIZE_MM) : '0';
      host.dataset.woodBevelSides = state.wood && state.woodEdge === 'bevel' ? 'front' : 'none';
      host.dataset.capThicknessMm = state.fixing === Fixing.Caps ? String(CAP_THICKNESS_MM) : '0';
      host.dataset.faceWidthMm = String(state.width);
      host.dataset.faceHeightMm = String(state.height);
    };

    const sourceSvg = sourceSvgRef.current;
    if (sourceSvg) {
      const crop = state.wood
        ? {
            x: WOOD_BACKING_OVERHANG_MM,
            y: WOOD_BACKING_OVERHANG_MM,
            width: state.width,
            height: state.height,
          }
        : undefined;
      const cropKey = crop ? `${crop.x}:${crop.y}:${crop.width}:${crop.height}` : 'full';
      const faceTextureKey = JSON.stringify([
        cropKey,
        activeStep,
        inscription,
        state.ageIntensity,
        state.border,
        state.borderStyle,
        state.capSize,
        state.fixing,
        state.generatedSvgContent,
        state.height,
        state.material,
        state.memorialImagePreviewUrl,
        state.memorialImageSvg,
        state.reverseEtch,
        state.shape,
        state.textColor,
        state.width,
      ]);
      makeSvgFaceTexture(sourceSvg, crop, faceTextureKey)
        .then((texture) => addFace(texture, true))
        .catch(() => addFace(fallbackTexture(), false));
    } else {
      addFace(fallbackTexture(), false);
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeStep,
    inscription,
    sourceSvgRef,
    state.ageIntensity,
    state.border,
    state.borderStyle,
    state.capSize,
    state.fixing,
    state.generatedSvgContent,
    state.height,
    state.material,
    state.memorialImagePreviewUrl,
    state.memorialImageSvg,
    state.shape,
    state.textColor,
    state.width,
    state.wood,
    state.woodEdge,
    state.woodTone,
  ]);

  return (
    <div className="three-plaque-preview" ref={hostRef} aria-label="Interactive 3D plaque preview">
      <div className="three-plaque-preview__label no-print">
        <strong>3D</strong>
        <span>drag to tilt</span>
      </div>
    </div>
  );
};
