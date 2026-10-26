"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Layers,
  Maximize,
  Minus,
  PaintBucket,
  Paintbrush,
  Pipette,
  Plus,
  Redo2,
  Save,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  clonePaintingDocument,
  createPaintingDocument,
  floodFillPixels,
  hexToRgb,
  isRasterDataUrl,
  makeLayerId,
  MAX_PAINTING_HISTORY,
  MAX_PAINTING_LAYERS,
  normalizePaintingDocument,
  type PaintingDocument,
  type PaintingLayer,
  type PaintingSnapshot,
  type PaintingStudioHandle,
} from "@/lib/painting";
import "./painting-studio.css";

export type {
  PaintingDocument,
  PaintingSnapshot,
  PaintingStudioHandle,
} from "@/lib/painting";

export type PaintingStudioProps = {
  initialDocument?: PaintingDocument;
  onChange?: (snapshot: PaintingSnapshot) => void;
  onSave?: () => void;
  onAssist?: () => void;
  disabled?: boolean;
};

type Tool = "brush" | "eraser" | "fill" | "eyedropper" | "hand";
type RuntimeLayer = { canvas: HTMLCanvasElement; dataUrl: string };
type Point = { x: number; y: number; pressure: number };
type Gesture =
  | {
      type: "draw";
      pointerId: number;
      layerId: string;
      tool: "brush" | "eraser";
      last: Point;
      color: string;
      size: number;
      opacity: number;
    }
  | {
      type: "pan";
      pointerId: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
    };

const PALETTE = [
  "#262d27",
  "#fffdf7",
  "#315943",
  "#6d936b",
  "#ef93a0",
  "#cb5f65",
  "#f5cc54",
  "#cf9146",
  "#779eae",
  "#696789",
  "#bca1be",
  "#916d50",
];
const TOOLS: {
  tool: Tool;
  label: string;
  shortcut: string;
  Icon: typeof Paintbrush;
}[] = [
  { tool: "brush", label: "Brush", shortcut: "B", Icon: Paintbrush },
  { tool: "eraser", label: "Eraser", shortcut: "E", Icon: Eraser },
  {
    tool: "fill",
    label: "Fill active layer",
    shortcut: "G",
    Icon: PaintBucket,
  },
  { tool: "eyedropper", label: "Pick a color", shortcut: "I", Icon: Pipette },
  { tool: "hand", label: "Move canvas", shortcut: "H", Icon: Hand },
];

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function readImage(dataUrl: string): Promise<HTMLImageElement> {
  if (!isRasterDataUrl(dataUrl))
    return Promise.reject(
      new Error("Choose a PNG, JPEG or WebP image under 18 MB."),
    );
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 40_000_000
      ) {
        reject(
          new Error("This image is too large. Try one under 40 megapixels."),
        );
      } else resolve(image);
    };
    image.onerror = () =>
      reject(
        new Error(
          "That image could not be opened. Try another PNG, JPEG or WebP.",
        ),
      );
    image.src = dataUrl;
  });
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Your browser could not open the drawing canvas.");
  return context;
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("input, textarea, select, [role='textbox']"))
  );
}

function sameDocument(
  first: PaintingDocument,
  second: PaintingDocument,
): boolean {
  return (
    first.width === second.width &&
    first.height === second.height &&
    first.background === second.background &&
    first.activeLayerId === second.activeLayerId &&
    first.layers.length === second.layers.length &&
    first.layers.every((layer, index) => {
      const other = second.layers[index];
      return (
        layer.id === other.id &&
        layer.name === other.name &&
        layer.visible === other.visible &&
        layer.opacity === other.opacity &&
        layer.dataUrl === other.dataUrl
      );
    })
  );
}

function historyMemory(history: PaintingDocument[]): number {
  const images = new Set<string>();
  for (const painting of history)
    for (const layer of painting.layers) images.add(layer.dataUrl);
  let bytes = 0;
  // Conservatively budget two bytes per character. Shared unchanged layer strings count once.
  for (const image of images) bytes += image.length * 2;
  return bytes;
}

export const PaintingStudio = forwardRef<
  PaintingStudioHandle,
  PaintingStudioProps
>(function PaintingStudio(
  { initialDocument, onChange, onSave, onAssist, disabled = false },
  ref,
) {
  const initialRef = useRef(initialDocument);
  const documentRef = useRef<PaintingDocument>(createPaintingDocument());
  const runtimeRef = useRef(new Map<string, RuntimeLayer>());
  const dirtyRef = useRef(new Set<string>());
  const historyRef = useRef<PaintingDocument[]>([]);
  const historyIndexRef = useRef(-1);
  const loadEpochRef = useRef(0);
  const mountedRef = useRef(false);
  const restoringRef = useRef(true);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const compareImageRef = useRef<HTMLCanvasElement | null>(null);
  const comparingRef = useRef(false);
  const spaceRef = useRef(false);
  const fitModeRef = useRef(true);
  const callbacksRef = useRef({ onChange, onSave, onAssist, disabled });
  callbacksRef.current = { onChange, onSave, onAssist, disabled };

  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState(14);
  const [opacity, setOpacity] = useState(1);
  const [color, setColor] = useState("#315943");
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [message, setMessage] = useState("Opening your canvas…");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const controlsRef = useRef({ tool, size, opacity, color, pan });
  controlsRef.current = { tool, size, opacity, color, pan };

  const compose = useCallback((canvas: HTMLCanvasElement) => {
    const painting = documentRef.current;
    if (canvas.width !== painting.width) canvas.width = painting.width;
    if (canvas.height !== painting.height) canvas.height = painting.height;
    const context = getContext(canvas);
    context.clearRect(0, 0, painting.width, painting.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = painting.background;
    context.fillRect(0, 0, painting.width, painting.height);
    for (const layer of painting.layers) {
      const runtime = runtimeRef.current.get(layer.id);
      if (layer.visible && runtime) {
        context.globalAlpha = layer.opacity;
        context.drawImage(runtime.canvas, 0, 0);
      }
    }
    context.globalAlpha = 1;
  }, []);

  const renderStage = useCallback(() => {
    const canvas = stageRef.current;
    if (!canvas) return;
    compose(canvas);
    if (comparingRef.current && compareImageRef.current) {
      const context = getContext(canvas);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        compareImageRef.current,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  }, [compose]);

  const captureDocument = useCallback((): PaintingDocument => {
    const painting = documentRef.current;
    for (const layer of painting.layers) {
      const runtime = runtimeRef.current.get(layer.id);
      if (runtime) {
        if (dirtyRef.current.has(layer.id)) {
          runtime.dataUrl = runtime.canvas.toDataURL("image/png");
          dirtyRef.current.delete(layer.id);
        }
        layer.dataUrl = runtime.dataUrl;
      }
    }
    return clonePaintingDocument(painting);
  }, []);

  const getSnapshot = useCallback((): PaintingSnapshot => {
    if (restoringRef.current)
      throw new Error("The canvas is not ready to save yet.");
    const painting = captureDocument();
    const preview = makeCanvas(painting.width, painting.height);
    compose(preview);
    return {
      document: painting,
      previewDataUrl: preview.toDataURL("image/png"),
    };
  }, [captureDocument, compose]);

  const emitChange = useCallback(() => {
    if (!mountedRef.current) return;
    callbacksRef.current.onChange?.(getSnapshot());
  }, [getSnapshot]);

  const commit = useCallback(() => {
    if (restoringRef.current) return;
    const painting = captureDocument();
    const previous = historyRef.current[historyIndexRef.current];
    if (!previous || !sameDocument(previous, painting)) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(painting);
      historyRef.current = history.slice(-MAX_PAINTING_HISTORY);
      while (
        historyRef.current.length > 1 &&
        historyMemory(historyRef.current) > 64 * 1024 * 1024
      ) {
        historyRef.current.shift();
      }
      historyIndexRef.current = historyRef.current.length - 1;
      emitChange();
    }
    setRevision((value) => value + 1);
  }, [captureDocument, emitChange]);

  const fitCanvas = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const painting = documentRef.current;
    const next = Math.min(
      (viewport.clientWidth - 48) / painting.width,
      (viewport.clientHeight - 48) / painting.height,
      1,
    );
    fitModeRef.current = true;
    setZoom(Math.max(0.05, next));
    setPan({ x: 0, y: 0 });
  }, []);

  const restoreDocument = useCallback(
    async (document: PaintingDocument): Promise<boolean> => {
      const epoch = ++loadEpochRef.current;
      restoringRef.current = true;
      setBusy(true);
      try {
        const painting = normalizePaintingDocument(document);
        const entries = await Promise.all(
          painting.layers.map(
            async (layer): Promise<[string, RuntimeLayer]> => {
              const canvas = makeCanvas(painting.width, painting.height);
              if (layer.dataUrl)
                getContext(canvas).drawImage(
                  await readImage(layer.dataUrl),
                  0,
                  0,
                  painting.width,
                  painting.height,
                );
              return [layer.id, { canvas, dataUrl: layer.dataUrl }];
            },
          ),
        );
        if (!mountedRef.current || epoch !== loadEpochRef.current) return false;
        documentRef.current = painting;
        runtimeRef.current = new Map(entries);
        dirtyRef.current.clear();
        gestureRef.current = null;
        comparingRef.current = false;
        setComparing(false);
        renderStage();
        setRevision((value) => value + 1);
        return true;
      } finally {
        if (mountedRef.current && epoch === loadEpochRef.current) {
          restoringRef.current = false;
          setBusy(false);
        }
      }
    },
    [renderStage],
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const initialize = async () => {
      try {
        if (
          await restoreDocument(initialRef.current ?? createPaintingDocument())
        ) {
          historyRef.current = [captureDocument()];
          historyIndexRef.current = 0;
          fitCanvas();
          setMessage("A little mark is a good place to start.");
          setRevision((value) => value + 1);
        }
      } catch (error) {
        if (cancelled) return;
        const explanation =
          error instanceof Error
            ? error.message
            : "Your saved canvas could not be opened.";
        setMessage(explanation);
        setFatalError(explanation);
        // Never replace an unreadable saved painting with an editable blank canvas.
        restoringRef.current = true;
        setBusy(false);
      }
    };
    void initialize();
    // This ref is a monotonically increasing async-load generation, not a DOM
    // node. Increment its current value to invalidate every pending restoration.
    return () => {
      cancelled = true;
      mountedRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++loadEpochRef.current;
    };
  }, [captureDocument, fitCanvas, restoreDocument]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (fitModeRef.current) fitCanvas();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitCanvas]);

  const finishGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.type === "draw") {
      commit();
      setMessage("Your latest marks are on the canvas.");
    }
  }, [commit]);

  const travelHistory = useCallback(
    (direction: number) => {
      if (restoringRef.current || callbacksRef.current.disabled) return;
      finishGesture();
      const index = historyIndexRef.current + direction;
      const painting = historyRef.current[index];
      if (!painting) return;
      void restoreDocument(painting)
        .then((applied) => {
          if (applied) {
            historyIndexRef.current = index;
            setMessage(
              direction < 0
                ? "One step back. Keep experimenting."
                : "That step is back on your canvas.",
            );
            setRevision((value) => value + 1);
            emitChange();
          }
        })
        .catch(() =>
          setMessage(
            "That history step could not be opened. Your current canvas is safe.",
          ),
        );
    },
    [emitChange, finishGesture, restoreDocument],
  );

  const exportPng = useCallback(() => {
    if (restoringRef.current) return;
    finishGesture();
    const snapshot = getSnapshot();
    const anchor = document.createElement("a");
    anchor.download = `canvas-club-${new Date().toISOString().slice(0, 10)}.png`;
    anchor.href = snapshot.previewDataUrl;
    anchor.click();
    setMessage("Your PNG is ready in your downloads.");
  }, [finishGesture, getSnapshot]);

  const addImage = useCallback(
    async (dataUrl: string, name = "Imported image") => {
      if (restoringRef.current)
        throw new Error("Let the canvas finish opening, then try again.");
      if (documentRef.current.layers.length >= MAX_PAINTING_LAYERS)
        throw new Error(
          "You have 8 layers. Remove one before adding another image.",
        );
      const image = await readImage(dataUrl);
      if (!mountedRef.current) return;
      // Capture at application time, so drawing done while the image loaded is preserved.
      finishGesture();
      const painting = documentRef.current;
      if (painting.layers.length >= MAX_PAINTING_LAYERS)
        throw new Error(
          "You have 8 layers. Remove one before adding another image.",
        );
      const beforeImage = makeCanvas(painting.width, painting.height);
      compose(beforeImage);
      const canvas = makeCanvas(painting.width, painting.height);
      const scale = Math.min(
        painting.width / image.naturalWidth,
        painting.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      getContext(canvas).drawImage(
        image,
        (painting.width - width) / 2,
        (painting.height - height) / 2,
        width,
        height,
      );
      const id = makeLayerId();
      painting.layers.push({
        id,
        name: name.slice(0, 60),
        visible: true,
        opacity: 1,
        dataUrl: "",
      });
      painting.activeLayerId = id;
      runtimeRef.current.set(id, { canvas, dataUrl: "" });
      dirtyRef.current.add(id);
      compareImageRef.current = beforeImage;
      comparingRef.current = false;
      setComparing(false);
      renderStage();
      commit();
      setMessage(
        "Image added as a new layer. Your original layers are still here.",
      );
    },
    [commit, compose, finishGesture, renderStage],
  );

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot,
      addImage,
      exportPng,
      undo: () => travelHistory(-1),
      redo: () => travelHistory(1),
    }),
    [addImage, exportPng, getSnapshot, travelHistory],
  );

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        spaceRef.current = true;
        setSpaceHeld(true);
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (
        modifier &&
        event.key.toLowerCase() === "s" &&
        callbacksRef.current.onSave
      ) {
        event.preventDefault();
        if (!restoringRef.current && !callbacksRef.current.disabled) {
          finishGesture();
          callbacksRef.current.onSave();
        }
        return;
      }
      if (restoringRef.current || callbacksRef.current.disabled) return;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        travelHistory(event.shiftKey ? 1 : -1);
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        travelHistory(1);
        return;
      }
      if (modifier || event.altKey) return;
      const shortcuts: Record<string, Tool> = {
        b: "brush",
        e: "eraser",
        g: "fill",
        i: "eyedropper",
        h: "hand",
      };
      if (shortcuts[event.key.toLowerCase()]) {
        setTool(shortcuts[event.key.toLowerCase()]);
        return;
      }
      if (event.key === "[") setSize((value) => Math.max(1, value - 2));
      if (event.key === "]") setSize((value) => Math.min(120, value + 2));
      if (event.key === "Escape") {
        comparingRef.current = false;
        setComparing(false);
        setLayersOpen(false);
        renderStage();
      }
    };
    const releaseSpace = (event?: KeyboardEvent) => {
      if (!event || event.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const loseFocus = () => {
      releaseSpace();
      finishGesture();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", loseFocus);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", loseFocus);
    };
  }, [finishGesture, renderStage, travelHistory]);

  const getPoint = (event: ReactPointerEvent<HTMLDivElement>): Point | null => {
    const canvas = stageRef.current;
    if (!canvas) return null;
    const rectangle = canvas.getBoundingClientRect();
    const painting = documentRef.current;
    return {
      x: ((event.clientX - rectangle.left) * painting.width) / rectangle.width,
      y: ((event.clientY - rectangle.top) * painting.height) / rectangle.height,
      pressure:
        event.pointerType === "mouse"
          ? 1
          : Math.max(0.12, event.pressure || 0.5),
    };
  };

  const paintSegment = (
    gesture: Extract<Gesture, { type: "draw" }>,
    point: Point,
    dot = false,
  ) => {
    const runtime = runtimeRef.current.get(gesture.layerId);
    if (!runtime) return;
    const context = getContext(runtime.canvas);
    context.save();
    context.globalCompositeOperation =
      gesture.tool === "eraser" ? "destination-out" : "source-over";
    context.globalAlpha = gesture.opacity;
    context.strokeStyle = gesture.color;
    context.fillStyle = gesture.color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = gesture.size * (0.35 + point.pressure * 0.65);
    context.beginPath();
    if (dot) {
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(gesture.last.x, gesture.last.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
    gesture.last = point;
    dirtyRef.current.add(gesture.layerId);
    renderStage();
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      busy ||
      disabled ||
      gestureRef.current ||
      (event.button !== 0 && event.button !== 1)
    )
      return;
    const current = controlsRef.current;
    if (current.tool === "hand" || spaceRef.current || event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        type: "pan",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: current.pan.x,
        startY: current.pan.y,
      };
      fitModeRef.current = false;
      return;
    }
    if (event.target !== stageRef.current || comparingRef.current) return;
    const point = getPoint(event);
    if (!point) return;
    const painting = documentRef.current;
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= painting.width ||
      point.y >= painting.height
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (current.tool === "eyedropper") {
      const stage = stageRef.current;
      if (!stage) return;
      const pixel = getContext(stage).getImageData(
        Math.floor(point.x),
        Math.floor(point.y),
        1,
        1,
      ).data;
      setColor(
        `#${Array.from(pixel.slice(0, 3))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      setTool("brush");
      setMessage("Color picked. Your brush is ready.");
      return;
    }
    const layer = painting.layers.find(
      (item) => item.id === painting.activeLayerId,
    );
    if (!layer?.visible || layer.opacity === 0) {
      setMessage("Show this layer and raise its opacity before painting.");
      return;
    }
    const runtime = runtimeRef.current.get(layer.id);
    if (!runtime) return;
    if (current.tool === "fill") {
      const context = getContext(runtime.canvas);
      const image = context.getImageData(0, 0, painting.width, painting.height);
      const changed = floodFillPixels(
        image.data,
        painting.width,
        painting.height,
        point.x,
        point.y,
        hexToRgb(current.color),
        current.opacity,
      );
      if (changed) {
        context.putImageData(image, 0, 0);
        dirtyRef.current.add(layer.id);
        renderStage();
        commit();
        setMessage("Area filled on the active layer. Undo is always here.");
      }
      return;
    }
    if (current.tool === "brush" || current.tool === "eraser") {
      const gesture: Gesture = {
        type: "draw",
        pointerId: event.pointerId,
        layerId: layer.id,
        tool: current.tool,
        last: point,
        color: current.color,
        size: current.size,
        opacity: current.opacity,
      };
      gestureRef.current = gesture;
      paintSegment(gesture, point, true);
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (gesture.type === "pan")
      setPan({
        x: gesture.startX + event.clientX - gesture.x,
        y: gesture.startY + event.clientY - gesture.y,
      });
    else {
      const point = getPoint(event);
      if (point) paintSegment(gesture, point);
    }
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    finishGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const mutateLayer = (
    id: string,
    change: (layer: PaintingLayer) => void,
    save = true,
  ) => {
    if (busy || disabled) return;
    finishGesture();
    const layer = documentRef.current.layers.find((item) => item.id === id);
    if (!layer) return;
    change(layer);
    renderStage();
    if (save) commit();
    else setRevision((value) => value + 1);
  };

  const addLayer = () => {
    if (busy || disabled) return;
    finishGesture();
    const painting = documentRef.current;
    if (painting.layers.length >= MAX_PAINTING_LAYERS) {
      setMessage("Eight layers is the limit for this canvas.");
      return;
    }
    const id = makeLayerId();
    const layer: PaintingLayer = {
      id,
      name: `Layer ${painting.layers.length + 1}`,
      visible: true,
      opacity: 1,
      dataUrl: "",
    };
    const index = painting.layers.findIndex(
      (item) => item.id === painting.activeLayerId,
    );
    painting.layers.splice(index + 1, 0, layer);
    painting.activeLayerId = id;
    runtimeRef.current.set(id, {
      canvas: makeCanvas(painting.width, painting.height),
      dataUrl: "",
    });
    renderStage();
    commit();
    setMessage("A fresh transparent layer, just for you.");
  };

  const removeLayer = (id: string) => {
    if (busy || disabled || documentRef.current.layers.length < 2) return;
    finishGesture();
    const painting = documentRef.current;
    const index = painting.layers.findIndex((layer) => layer.id === id);
    painting.layers.splice(index, 1);
    runtimeRef.current.delete(id);
    dirtyRef.current.delete(id);
    if (painting.activeLayerId === id)
      painting.activeLayerId = painting.layers[Math.max(0, index - 1)].id;
    renderStage();
    commit();
    setMessage("Layer removed. Undo will bring it back.");
  };

  const moveLayer = (id: string, direction: number) => {
    if (busy || disabled) return;
    finishGesture();
    const layers = documentRef.current.layers;
    const index = layers.findIndex((layer) => layer.id === id);
    const next = index + direction;
    if (next < 0 || next >= layers.length) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    renderStage();
    commit();
  };

  const clearLayer = () => {
    if (
      busy ||
      disabled ||
      !window.confirm(
        "Clear every mark on the active layer? You can undo this.",
      )
    )
      return;
    finishGesture();
    const painting = documentRef.current;
    const runtime = runtimeRef.current.get(painting.activeLayerId);
    if (!runtime) return;
    getContext(runtime.canvas).clearRect(0, 0, painting.width, painting.height);
    dirtyRef.current.add(painting.activeLayerId);
    renderStage();
    commit();
    setMessage("A clean layer. The rest of your painting is safe.");
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 18 * 1024 * 1024
    ) {
      setMessage("Choose a PNG, JPEG or WebP image under 18 MB.");
      return;
    }
    setMessage("Opening your image…");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("That file could not be read."));
        reader.readAsDataURL(file);
      });
      await addImage(dataUrl, file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your image could not be opened.",
      );
    }
  };

  const changeZoom = (factor: number) => {
    fitModeRef.current = false;
    setZoom((value) => Math.max(0.05, Math.min(4, value * factor)));
  };

  const toggleCompare = () => {
    finishGesture();
    comparingRef.current = !comparingRef.current;
    setComparing(comparingRef.current);
    renderStage();
  };

  // revision deliberately reflects mutations held in refs, keeping pointer drawing off React's render path.
  void revision;
  const painting = documentRef.current;
  const activeLayer = painting.layers.find(
    (layer) => layer.id === painting.activeLayerId,
  );
  const locked = busy || disabled || !!fatalError;

  return (
    <section
      className="painting-studio"
      aria-label="Painting studio"
      aria-busy={busy}
    >
      <div className="ps-toolbar">
        <div className="ps-tool-group" role="group" aria-label="Painting tools">
          {TOOLS.map(({ tool: item, label, shortcut, Icon }) => (
            <button
              key={item}
              type="button"
              className={`ps-icon-button ${tool === item ? "is-selected" : ""}`}
              aria-label={`${label} (${shortcut})`}
              title={`${label} · ${shortcut}`}
              aria-pressed={tool === item}
              onClick={() => setTool(item)}
              disabled={locked}
            >
              <Icon size={19} />
            </button>
          ))}
        </div>
        <div
          className="ps-tool-group ps-history"
          role="group"
          aria-label="History"
        >
          <button
            type="button"
            className="ps-icon-button"
            title="Undo · Ctrl/⌘ Z"
            aria-label="Undo"
            disabled={locked || historyIndexRef.current <= 0}
            onClick={() => travelHistory(-1)}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="ps-icon-button"
            title="Redo · Ctrl/⌘ Shift Z"
            aria-label="Redo"
            disabled={
              locked || historyIndexRef.current >= historyRef.current.length - 1
            }
            onClick={() => travelHistory(1)}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <label className="ps-slider-label">
          Size{" "}
          <input
            aria-label="Brush size"
            type="range"
            min="1"
            max="120"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
            disabled={locked}
          />
          <span>{size}</span>
        </label>
        <label className="ps-slider-label ps-opacity">
          Opacity{" "}
          <input
            aria-label="Brush opacity"
            type="range"
            min="5"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(event) => setOpacity(Number(event.target.value) / 100)}
            disabled={locked}
          />
          <span>{Math.round(opacity * 100)}%</span>
        </label>
        <div className="ps-toolbar-actions">
          <button
            type="button"
            className="ps-icon-button ps-mobile-layers"
            title="Layers"
            aria-label="Toggle layers"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen(!layersOpen)}
          >
            <Layers size={19} />
          </button>
          <button
            type="button"
            className="ps-icon-button"
            title="Import image as a layer"
            aria-label="Import image"
            onClick={() => fileRef.current?.click()}
            disabled={locked || painting.layers.length >= MAX_PAINTING_LAYERS}
          >
            <Upload size={18} />
          </button>
          <button
            type="button"
            className="ps-icon-button"
            title="Download PNG"
            aria-label="Download PNG"
            onClick={exportPng}
            disabled={busy || !!fatalError}
          >
            <Download size={18} />
          </button>
          {onSave && (
            <button
              type="button"
              className="ps-action ps-save"
              onClick={() => {
                finishGesture();
                onSave();
              }}
              disabled={locked}
            >
              <Save size={16} />
              <span>Save</span>
            </button>
          )}
          {onAssist && (
            <button
              type="button"
              className="ps-action ps-assist"
              onClick={() => {
                finishGesture();
                onAssist();
              }}
              disabled={locked}
            >
              <Sparkles size={16} />
              <span>AI assist</span>
            </button>
          )}
        </div>
      </div>
      <div className="ps-colorbar" role="group" aria-label="Paint colors">
        <label className="ps-custom-color" title="Choose any color">
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="Custom paint color"
            disabled={locked}
          />
          <span style={{ backgroundColor: color }} />
        </label>
        <div className="ps-palette">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`ps-swatch ${color === swatch ? "is-selected" : ""}`}
              aria-label={`Use ${swatch}`}
              title={swatch}
              aria-pressed={color === swatch}
              style={{ backgroundColor: swatch }}
              onClick={() => setColor(swatch)}
              disabled={locked}
            />
          ))}
        </div>
        <span className="ps-tool-hint">
          {tool === "fill"
            ? "Fills connected pixels on this layer"
            : tool === "hand"
              ? "Drag to find your corner"
              : "Make a mark. See where it goes."}
        </span>
      </div>
      <div className="ps-workspace">
        <div
          ref={viewportRef}
          className={`ps-viewport ${tool === "hand" || spaceHeld ? "is-panning" : ""} ${comparing ? "is-comparing" : ""}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onLostPointerCapture={finishGesture}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="ps-canvas-frame"
            style={{
              width: painting.width * zoom,
              height: painting.height * zoom,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {/* compose owns intrinsic dimensions: React setting width/height after a restore clears the painted bitmap. */}
            <canvas
              ref={stageRef}
              className={`ps-canvas ps-cursor-${tool}`}
              aria-label={`${painting.width} by ${painting.height} painting canvas. Use the toolbar to choose a tool; draw with a mouse, finger or pen.`}
            />
          </div>
          {busy && (
            <div className="ps-canvas-loading">
              <span className="ps-loading-dot" />
              Opening your canvas…
            </div>
          )}
          {fatalError && (
            <div className="ps-canvas-error" role="alert">
              <strong>This painting could not be opened.</strong>
              <p>{fatalError}</p>
              <p>Your saved layers have not been changed.</p>
              <button type="button" onClick={() => window.location.reload()}>
                Try reopening
              </button>
            </div>
          )}
          {comparing && (
            <div className="ps-compare-label">
              Before the image layer{" "}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={toggleCompare}
              >
                Back to painting <X size={14} />
              </button>
            </div>
          )}
          <div
            className="ps-view-controls"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ps-icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => changeZoom(1 / 1.2)}
              disabled={zoom <= 0.05}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="ps-zoom-value"
              onClick={() => {
                fitModeRef.current = false;
                setZoom(1);
              }}
              title="Set zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="ps-icon-button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => changeZoom(1.2)}
              disabled={zoom >= 4}
            >
              <Plus size={16} />
            </button>
            <span className="ps-control-divider" />
            <button
              type="button"
              className="ps-icon-button"
              aria-label="Fit canvas in view"
              title="Fit canvas"
              onClick={fitCanvas}
            >
              <Maximize size={16} />
            </button>
            {compareImageRef.current && (
              <>
                <span className="ps-control-divider" />
                <button
                  type="button"
                  className={`ps-icon-button ${comparing ? "is-selected" : ""}`}
                  aria-label="Compare with before imported image"
                  title="Before / after image layer"
                  aria-pressed={comparing}
                  onClick={toggleCompare}
                >
                  <SplitSquareHorizontal size={17} />
                </button>
              </>
            )}
          </div>
        </div>
        {layersOpen && (
          <button
            type="button"
            className="ps-layer-backdrop"
            aria-label="Close layers"
            onClick={() => setLayersOpen(false)}
          />
        )}
        <aside
          className={`ps-layer-panel ${layersOpen ? "is-open" : ""}`}
          aria-label="Painting layers"
        >
          <div className="ps-panel-title">
            <div>
              <Layers size={16} />
              <strong>Layers</strong>
              <span>
                {painting.layers.length}/{MAX_PAINTING_LAYERS}
              </span>
            </div>
            <button
              type="button"
              className="ps-icon-button ps-mobile-layers"
              aria-label="Close layers"
              onClick={() => setLayersOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p className="ps-layer-explainer">Little pieces, one painting.</p>
          <button
            type="button"
            className="ps-new-layer"
            onClick={addLayer}
            disabled={locked || painting.layers.length >= MAX_PAINTING_LAYERS}
          >
            <Plus size={16} />
            New layer
          </button>
          <div className="ps-layer-list">
            {[...painting.layers].reverse().map((layer) => (
              <div
                key={layer.id}
                className={`ps-layer ${layer.id === painting.activeLayerId ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className="ps-icon-button ps-visibility"
                  aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                  onClick={() =>
                    mutateLayer(layer.id, (item) => {
                      item.visible = !item.visible;
                    })
                  }
                  disabled={locked}
                >
                  {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  type="button"
                  className="ps-select-layer"
                  aria-pressed={layer.id === painting.activeLayerId}
                  onClick={() =>
                    mutateLayer(layer.id, () => {
                      painting.activeLayerId = layer.id;
                    })
                  }
                  disabled={locked}
                >
                  <span className="ps-layer-thumbnail">
                    {layer.dataUrl && (
                      <img src={layer.dataUrl} alt="" draggable={false} />
                    )}
                  </span>
                  <span className="ps-layer-name">{layer.name}</span>
                </button>
              </div>
            ))}
          </div>
          {activeLayer && (
            <div className="ps-layer-settings">
              <label className="ps-layer-name-field">
                Layer name
                <input
                  aria-label="Active layer name"
                  maxLength={60}
                  key={`${activeLayer.id}:${activeLayer.name}`}
                  defaultValue={activeLayer.name}
                  disabled={locked}
                  onBlur={(event) =>
                    mutateLayer(activeLayer.id, (item) => {
                      item.name = event.target.value.trim() || "Untitled layer";
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <label className="ps-layer-opacity">
                Layer opacity
                <span>{Math.round(activeLayer.opacity * 100)}%</span>
                <input
                  aria-label="Active layer opacity"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(activeLayer.opacity * 100)}
                  disabled={locked}
                  onChange={(event) =>
                    mutateLayer(
                      activeLayer.id,
                      (item) => {
                        item.opacity = Number(event.target.value) / 100;
                      },
                      false,
                    )
                  }
                  onPointerUp={commit}
                  onKeyUp={commit}
                  onBlur={commit}
                />
              </label>
              <div className="ps-layer-actions">
                <button
                  type="button"
                  className="ps-icon-button"
                  aria-label="Move layer up"
                  title="Move layer up"
                  disabled={
                    locked ||
                    painting.layers[painting.layers.length - 1]?.id ===
                      activeLayer.id
                  }
                  onClick={() => moveLayer(activeLayer.id, 1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="ps-icon-button"
                  aria-label="Move layer down"
                  title="Move layer down"
                  disabled={locked || painting.layers[0]?.id === activeLayer.id}
                  onClick={() => moveLayer(activeLayer.id, -1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="ps-icon-button ps-delete-layer"
                  aria-label="Delete active layer"
                  title="Delete layer · can be undone"
                  disabled={locked || painting.layers.length < 2}
                  onClick={() => removeLayer(activeLayer.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
          <div className="ps-paper-setting">
            <span
              className="ps-paper-chip"
              style={{ background: painting.background }}
            />
            Paper background
          </div>
          <button
            type="button"
            className="ps-clear"
            disabled={locked}
            onClick={clearLayer}
          >
            Clear active layer
          </button>
          <p className="ps-layer-tip">
            Hold Space to move. B brush · E erase
            <br />
            Ctrl/⌘ Z to try again.
          </p>
        </aside>
      </div>
      <footer className="ps-status">
        <span role="status" aria-live="polite">
          {message}
        </span>
        <span>
          {painting.width} × {painting.height}
          <span className="ps-status-divider">·</span>
          {activeLayer?.name}
        </span>
      </footer>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Import a painting image"
        hidden
        onChange={(event) => {
          void importFile(event);
        }}
      />
    </section>
  );
});

export default PaintingStudio;
