export type PhotoFraming = { horizontal: number; vertical: number; zoom: number; angle: number };
export const defaultFraming: PhotoFraming = { horizontal: 0, vertical: 0, zoom: 1, angle: 0 };

export function photoGeometry(width: number, height: number, size: number, framing: PhotoFraming) {
  const radians = framing.angle * Math.PI / 180;
  // The inverse-rotated square must fit inside the image, including at its corners.
  const extent = size * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  const scale = Math.max(extent / width, extent / height) * framing.zoom;
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return {
    radians, width: drawnWidth, height: drawnHeight,
    x: -drawnWidth / 2 + framing.horizontal / 100 * (drawnWidth - extent) / 2,
    y: -drawnHeight / 2 + framing.vertical / 100 * (drawnHeight - extent) / 2,
  };
}
