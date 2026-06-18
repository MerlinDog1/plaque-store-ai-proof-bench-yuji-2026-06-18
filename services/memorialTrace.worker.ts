import { contours } from "d3-contour";

type TraceRequest = {
  imageBuffer: ArrayBuffer;
  mimeType: string;
  threshold: number;
};

type TraceResponse = {
  type?: "progress";
  message?: string;
  svg?: string;
  error?: string;
};

function postProgress(message: string) {
  self.postMessage({ type: "progress", message } satisfies TraceResponse);
}

async function loadBitmap(imageBuffer: ArrayBuffer, mimeType: string): Promise<ImageBitmap> {
  const blob = new Blob([imageBuffer], { type: mimeType || "image/png" });
  return createImageBitmap(blob);
}

async function traceMemorialImage(imageBuffer: ArrayBuffer, mimeType: string, threshold = 128): Promise<string> {
  postProgress("Decoding engraving artwork...");
  const img = await loadBitmap(imageBuffer, mimeType);

  try {
    const sourceMax = Math.max(img.width, img.height);
    const maxDimension = 4096;
    const scale = sourceMax > maxDimension ? maxDimension / sourceMax : Math.min(4, maxDimension / sourceMax);
    const sw = Math.max(1, Math.floor(img.width * scale));
    const sh = Math.max(1, Math.floor(img.height * scale));

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context available for tracing.");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, sw, sh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, sw, sh);

    postProgress("Preparing tracing contrast...");
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const pixels = imageData.data;
    const values = new Float32Array(sw * sh);
    const integral = new Float32Array(sw * sh);

    for (let y = 0; y < sh; y++) {
      let rowSum = 0;
      for (let x = 0; x < sw; x++) {
        const idx = y * sw + x;
        const r = pixels[idx * 4];
        const g = pixels[idx * 4 + 1];
        const b = pixels[idx * 4 + 2];
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        rowSum += gray;
        integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * sw + x] : 0);
      }
    }

    const minSide = Math.min(sw, sh);
    const windowA = Math.floor(Math.max(15, Math.floor(minSide * 0.02)) / 2);
    const windowB = Math.floor(Math.max(5, Math.floor(minSide * 0.005)) / 2);
    const windowC = Math.floor(Math.max(3, Math.floor(minSide * 0.001)) / 2);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = y * sw + x;
        const alpha = pixels[idx * 4 + 3];
        if (alpha < 128) {
          values[idx] = 0;
          continue;
        }

        const r = pixels[idx * 4];
        const g = pixels[idx * 4 + 1];
        const b = pixels[idx * 4 + 2];
        const gray = r * 0.299 + g * 0.587 + b * 0.114;

        let x1 = Math.max(0, x - windowA);
        let y1 = Math.max(0, y - windowA);
        let x2 = Math.min(sw - 1, x + windowA);
        let y2 = Math.min(sh - 1, y + windowA);
        let area = (x2 - x1 + 1) * (y2 - y1 + 1);
        let sumA = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * sw + (x1 - 1)] : 0;
        let sumB = y1 > 0 ? integral[(y1 - 1) * sw + x2] : 0;
        let sumC = x1 > 0 ? integral[y2 * sw + (x1 - 1)] : 0;
        let sumD = integral[y2 * sw + x2];
        const localA = Math.max(0, (sumD - sumB - sumC + sumA) / area - gray) * 4;

        x1 = Math.max(0, x - windowB);
        y1 = Math.max(0, y - windowB);
        x2 = Math.min(sw - 1, x + windowB);
        y2 = Math.min(sh - 1, y + windowB);
        area = (x2 - x1 + 1) * (y2 - y1 + 1);
        sumA = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * sw + (x1 - 1)] : 0;
        sumB = y1 > 0 ? integral[(y1 - 1) * sw + x2] : 0;
        sumC = x1 > 0 ? integral[y2 * sw + (x1 - 1)] : 0;
        sumD = integral[y2 * sw + x2];
        const localB = Math.max(0, (sumD - sumB - sumC + sumA) / area - gray) * 4.5;

        x1 = Math.max(0, x - windowC);
        y1 = Math.max(0, y - windowC);
        x2 = Math.min(sw - 1, x + windowC);
        y2 = Math.min(sh - 1, y + windowC);
        area = (x2 - x1 + 1) * (y2 - y1 + 1);
        sumA = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * sw + (x1 - 1)] : 0;
        sumB = y1 > 0 ? integral[(y1 - 1) * sw + x2] : 0;
        sumC = x1 > 0 ? integral[y2 * sw + (x1 - 1)] : 0;
        sumD = integral[y2 * sw + x2];
        const localC = Math.max(0, (sumD - sumB - sumC + sumA) / area - gray) * 5.5;

        values[idx] = Math.min(255, Math.max(255 - gray, localA, localB, localC));
      }
    }

    postProgress("Building vector contours...");
    const blurredValues = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = y * sw + x;
        if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) {
          blurredValues[idx] = values[idx];
          continue;
        }
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += values[(y + dy) * sw + (x + dx)];
        }
        blurredValues[idx] = sum / 9;
      }
    }

    const contourThreshold = Math.min(254, 255 - threshold + 6);
    const contourList = contours().size([sw, sh]).thresholds([contourThreshold])(blurredValues as any);
    let pathData = "";

    if (contourList.length > 0) {
      const multiPolygon = contourList[0] as any;
      const polygonArea = (ring: [number, number][]) => {
        let area = 0;
        for (let i = 0; i < ring.length; i++) {
          const p1 = ring[i];
          const p2 = ring[(i + 1) % ring.length];
          area += p1[0] * p2[1] - p2[0] * p1[1];
        }
        return Math.abs(area / 2);
      };
      const minArea = 3 * scale * scale;
      multiPolygon.coordinates = multiPolygon.coordinates.filter((polygon: [number, number][][]) => {
        const outerRing = polygon?.[0];
        return outerRing?.length && polygonArea(outerRing) >= minArea;
      });

      const simplifyRing = (ring: [number, number][], tolerance: number): [number, number][] => {
        if (ring.length <= 2) return ring;
        let maxDist = 0;
        let maxIdx = 0;
        const p1 = ring[0];
        const p2 = ring[ring.length - 1];

        for (let i = 1; i < ring.length - 1; i++) {
          const p = ring[i];
          const num = Math.abs((p2[1] - p1[1]) * p[0] - (p2[0] - p1[0]) * p[1] + p2[0] * p1[1] - p2[1] * p1[0]);
          const den = Math.hypot(p2[1] - p1[1], p2[0] - p1[0]);
          const dist = den === 0 ? Math.hypot(p[0] - p1[0], p[1] - p1[1]) : num / den;
          if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
          }
        }

        if (maxDist > tolerance) {
          const left = simplifyRing(ring.slice(0, maxIdx + 1), tolerance);
          const right = simplifyRing(ring.slice(maxIdx), tolerance);
          return left.slice(0, -1).concat(right);
        }
        return [p1, p2];
      };

      multiPolygon.coordinates = multiPolygon.coordinates.map((polygon: [number, number][][]) => {
        return polygon.map(ring => simplifyRing(ring, 0.5));
      });

      const commands: string[] = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const trackPoint = ([x, y]: [number, number]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      };
      multiPolygon.coordinates.forEach((polygon: [number, number][][]) => {
        polygon.forEach((ring: [number, number][]) => {
          if (ring.length < 3) return;
          ring.forEach(trackPoint);
          const p0 = ring[0];
          const p1 = ring[1];
          commands.push(`M ${(p0[0] + p1[0]) / 2},${(p0[1] + p1[1]) / 2}`);

          for (let i = 1; i < ring.length - 1; i++) {
            const current = ring[i];
            const next = ring[i + 1];
            commands.push(`Q ${current[0]},${current[1]} ${(current[0] + next[0]) / 2},${(current[1] + next[1]) / 2}`);
          }
          commands.push("Z");
        });
      });
      pathData = commands.join(" ");
      const hasBounds = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY);
      if (hasBounds) {
        const inkW = Math.max(1, maxX - minX);
        const inkH = Math.max(1, maxY - minY);
        const pad = Math.max(inkW, inkH) * 0.08;
        const vx = Math.max(0, minX - pad);
        const vy = Math.max(0, minY - pad);
        const vw = Math.min(sw - vx, inkW + pad * 2);
        const vh = Math.min(sh - vy, inkH + pad * 2);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}"><path d="${pathData}" fill="currentColor" fill-rule="evenodd"/></svg>`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}"><path d="${pathData}" fill="currentColor" fill-rule="evenodd"/></svg>`;
  } finally {
    img.close();
  }
}

self.onmessage = async (event: MessageEvent<TraceRequest>) => {
  const response: TraceResponse = {};
  try {
    response.svg = await traceMemorialImage(event.data.imageBuffer, event.data.mimeType, event.data.threshold);
  } catch (error) {
    response.error = error instanceof Error ? error.message : "Memorial image tracing failed.";
  }
  self.postMessage(response);
};
