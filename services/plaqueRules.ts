import { Shape } from '../types';

export function isBenchPlaqueFormat(width: number, height: number, shape: Shape) {
  if (shape !== Shape.Rect) return false;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (shortSide <= 0) return false;
  return shortSide <= 90 && longSide / shortSide >= 3;
}
