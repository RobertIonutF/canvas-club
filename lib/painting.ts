export type PaintingLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  /** A PNG, JPEG or WebP data URL; an empty string is a transparent layer. */
  dataUrl: string;
};

/** Layers are stored in paint order: the first layer is the bottom layer. */
export type PaintingDocument = {
  version: 1;
  width: number;
  height: number;
  background: string;
  layers: PaintingLayer[];
  activeLayerId: string;
};

export type PaintingSnapshot = {
  document: PaintingDocument;
  previewDataUrl: string;
};

export type PaintingStudioHandle = {
  getSnapshot(): PaintingSnapshot;
  addImage(dataUrl: string, name?: string): Promise<void>;
  exportPng(): void;
  undo(): void;
  redo(): void;
};

export const MAX_PAINTING_LAYERS = 8;
export const MAX_PAINTING_HISTORY = 20;

export function makeLayerId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPaintingDocument(): PaintingDocument {
  const id = makeLayerId();
  return {
    version: 1,
    width: 1024,
    height: 1024,
    background: "#fffdf7",
    layers: [
      { id, name: "My first marks", visible: true, opacity: 1, dataUrl: "" },
    ],
    activeLayerId: id,
  };
}

export function clonePaintingDocument(
  document: PaintingDocument,
): PaintingDocument {
  return {
    ...document,
    layers: document.layers.map((layer) => ({ ...layer })),
  };
}

export function isRasterDataUrl(value: string): boolean {
  return (
    value.length <= 24 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=\r\n]+$/i.test(value)
  );
}

export function normalizePaintingDocument(
  value: PaintingDocument,
): PaintingDocument {
  if (
    value.version !== 1 ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 64 ||
    value.height < 64 ||
    value.width > 1024 ||
    value.height > 1024 ||
    !Array.isArray(value.layers) ||
    value.layers.length < 1 ||
    value.layers.length > MAX_PAINTING_LAYERS
  ) {
    throw new Error("This canvas format or size is not supported.");
  }
  const usedIds = new Set<string>();
  const layers = value.layers.map((layer, index) => {
    if (
      !layer ||
      typeof layer.id !== "string" ||
      usedIds.has(layer.id) ||
      typeof layer.dataUrl !== "string" ||
      (layer.dataUrl && !isRasterDataUrl(layer.dataUrl))
    ) {
      throw new Error(
        "A saved layer could not be read. Your original has not been changed.",
      );
    }
    usedIds.add(layer.id);
    return {
      id: layer.id,
      name: String(layer.name || `Layer ${index + 1}`).slice(0, 60),
      visible: layer.visible !== false,
      opacity: Number.isFinite(layer.opacity)
        ? Math.max(0, Math.min(1, layer.opacity))
        : 1,
      dataUrl: layer.dataUrl,
    };
  });
  return {
    version: 1,
    width: value.width,
    height: value.height,
    background: /^#[a-f\d]{6}$/i.test(value.background)
      ? value.background
      : "#fffdf7",
    layers,
    activeLayerId: usedIds.has(value.activeLayerId)
      ? value.activeLayerId
      : layers[layers.length - 1].id,
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = /^#[a-f\d]{6}$/i.test(hex) ? hex.slice(1) : "262d27";
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Iterative flood fill: bounded memory, no recursive stack overflow on large empty canvases. */
export function floodFillPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: [number, number, number],
  opacity: number,
  tolerance = 24,
): number {
  x = Math.floor(x);
  y = Math.floor(y);
  if (
    x < 0 ||
    y < 0 ||
    x >= width ||
    y >= height ||
    opacity <= 0 ||
    pixels.length !== width * height * 4
  )
    return 0;
  const start = y * width + x;
  const offset = start * 4;
  const target = [
    pixels[offset],
    pixels[offset + 1],
    pixels[offset + 2],
    pixels[offset + 3],
  ];
  const alpha = Math.max(0, Math.min(1, opacity));
  const oldAlpha = target[3] / 255;
  const resultAlpha = alpha + oldAlpha * (1 - alpha);
  const result = [
    ...color.map((channel, index) =>
      Math.round(
        (channel * alpha + target[index] * oldAlpha * (1 - alpha)) /
          resultAlpha,
      ),
    ),
    Math.round(resultAlpha * 255),
  ];
  if (result.every((channel, index) => channel === target[index])) return 0;

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 1;
  let changed = 0;
  queue[0] = start;
  visited[start] = 1;
  const enqueue = (index: number) => {
    if (!visited[index]) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };
  while (head < tail) {
    const index = queue[head++];
    const at = index * 4;
    if (Math.abs(pixels[at + 3] - target[3]) > tolerance) continue;
    if (
      target[3] !== 0 &&
      (Math.abs(pixels[at] - target[0]) > tolerance ||
        Math.abs(pixels[at + 1] - target[1]) > tolerance ||
        Math.abs(pixels[at + 2] - target[2]) > tolerance)
    )
      continue;
    for (let channel = 0; channel < 4; channel++)
      pixels[at + channel] = result[channel];
    changed++;
    const column = index % width;
    if (column > 0) enqueue(index - 1);
    if (column < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < width * (height - 1)) enqueue(index + width);
  }
  return changed;
}
