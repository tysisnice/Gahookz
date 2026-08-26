import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export const DEFAULT_PAINT_PALETTE = Object.freeze([
  "#111214",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#8a4f21",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#246bfe",
  "#7c3aed",
  "#ec4899"
]);

export const DEFAULT_BRUSH_SIZES = Object.freeze([
  Object.freeze({ id: "small", label: "Small", size: 4 }),
  Object.freeze({ id: "medium", label: "Medium", size: 12 }),
  Object.freeze({ id: "large", label: "Large", size: 28 })
]);

const ABSOLUTE_MAX_CANVAS_DIMENSION = 1024;
const DEFAULT_MAX_HISTORY = 12;
const DEFAULT_MAX_UPLOAD_BYTES = 8_000_000;
const VISUALLY_HIDDEN_STYLE = Object.freeze({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getBoundedCanvasSize({
  width = 512,
  height,
  aspectRatio = 1,
  maxDimension = 768
} = {}) {
  const boundedMaximum = clamp(
    Math.round(finitePositive(maxDimension) || 768),
    64,
    ABSOLUTE_MAX_CANVAS_DIMENSION
  );
  const safeAspectRatio = clamp(finitePositive(aspectRatio) || 1, 0.2, 5);
  const requestedWidth = finitePositive(width);
  const requestedHeight = finitePositive(height);
  let canvasWidth = requestedWidth || (requestedHeight ? requestedHeight * safeAspectRatio : 512);
  let canvasHeight = requestedHeight || canvasWidth / safeAspectRatio;
  const scale = Math.min(1, boundedMaximum / Math.max(canvasWidth, canvasHeight));
  canvasWidth = clamp(Math.round(canvasWidth * scale), 16, boundedMaximum);
  canvasHeight = clamp(Math.round(canvasHeight * scale), 16, boundedMaximum);
  return Object.freeze({ width: canvasWidth, height: canvasHeight });
}

export function canvasDataUrlByteSize(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return 0;
  const payload = dataUrl.slice(commaIndex + 1);
  if (!dataUrl.slice(0, commaIndex).includes(";base64")) {
    try {
      return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
    } catch (_error) {
      return payload.length;
    }
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

function normalizedMimeType(value) {
  return ["image/png", "image/jpeg", "image/webp"].includes(value) ? value : "image/png";
}

function resetCanvas(canvas, backgroundColor, transparent) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.restore();
}

function drawImageToCanvas(canvas, image, fit, backgroundColor, transparent) {
  const context = canvas?.getContext("2d");
  const sourceWidth = finitePositive(image?.naturalWidth) || finitePositive(image?.width);
  const sourceHeight = finitePositive(image?.naturalHeight) || finitePositive(image?.height);
  if (!context || !sourceWidth || !sourceHeight) return false;
  resetCanvas(canvas, backgroundColor, transparent);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (fit === "stretch") {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    const scale = fit === "cover"
      ? Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
      : Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(
      image,
      (canvas.width - drawWidth) / 2,
      (canvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }
  context.restore();
  return true;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (typeof source === "string" && /^https?:/i.test(source)) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = source;
  });
}

function pointOnCanvas(canvas, event) {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width || 1;
  const height = bounds.height || 1;
  return {
    x: clamp((event.clientX - bounds.left) * canvas.width / width, 0, canvas.width),
    y: clamp((event.clientY - bounds.top) * canvas.height / height, 0, canvas.height)
  };
}

function paintDot(context, point, lineWidth, color, erasing, transparent) {
  context.save();
  context.globalCompositeOperation = erasing && transparent ? "destination-out" : "source-over";
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function paintLine(context, from, to, lineWidth, color, erasing, transparent) {
  context.save();
  context.globalCompositeOperation = erasing && transparent ? "destination-out" : "source-over";
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

/**
 * A dependency-free paint canvas suitable for avatars and Gahook overlay frames.
 *
 * `value` may be a data URL (or another browser-loadable image URL). When supplied,
 * external value changes replace the canvas. In uncontrolled use, pass `initialImage`
 * instead. `onChange` fires after a completed edit with `(dataUrl, metadata)`, while
 * `onExport` fires only from the optional export button.
 */
export function SimplePaintEditor({
  value,
  initialImage,
  onChange,
  onExport,
  onError,
  width = 512,
  height,
  aspectRatio = 1,
  maxExportDimension = 768,
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  maxHistory = DEFAULT_MAX_HISTORY,
  palette = DEFAULT_PAINT_PALETTE,
  brushSizes = DEFAULT_BRUSH_SIZES,
  initialColor = "#111214",
  backgroundColor = "#ffffff",
  transparent = false,
  imageFit = "contain",
  mimeType = "image/png",
  imageQuality = 0.9,
  readOnly = false,
  allowUpload = true,
  showExport = true,
  exportLabel = "Use drawing",
  clearLabel = "Clear canvas",
  label = "Drawing canvas",
  className = ""
}) {
  const canvasRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const uploadRef = useRef(null);
  const historyRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const hasArtworkRef = useRef(false);
  const hasBaseImageRef = useRef(false);
  const lastEmittedValueRef = useRef(null);
  const sourceLoadRef = useRef(0);
  const descriptionId = useId();
  const statusId = useId();
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState(() => typeof initialColor === "string" ? initialColor : "#111214");
  const [brushSizeId, setBrushSizeId] = useState(() => String(brushSizes[1]?.id || brushSizes[0]?.id || "medium"));
  const [canUndo, setCanUndo] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState("Ready to draw.");

  const canvasSize = useMemo(() => getBoundedCanvasSize({
    width,
    height,
    aspectRatio,
    maxDimension: maxExportDimension
  }), [width, height, aspectRatio, maxExportDimension]);
  const safePalette = useMemo(() => {
    const entries = Array.isArray(palette) ? palette.filter(entry => typeof entry === "string" && entry.trim()) : [];
    return entries.length ? entries.slice(0, 24) : DEFAULT_PAINT_PALETTE;
  }, [palette]);
  const safeBrushSizes = useMemo(() => {
    const entries = Array.isArray(brushSizes) ? brushSizes.filter(entry => finitePositive(entry?.size)) : [];
    return (entries.length ? entries.slice(0, 3) : DEFAULT_BRUSH_SIZES).map((entry, index) => ({
      id: String(entry.id || `size-${index + 1}`),
      label: String(entry.label || `${entry.size} pixel brush`),
      size: clamp(Number(entry.size), 1, 64)
    }));
  }, [brushSizes]);
  const activeBrushSize = safeBrushSizes.find(entry => entry.id === brushSizeId) || safeBrushSizes[0];
  const exportMimeType = normalizedMimeType(mimeType);
  const externalSource = value !== undefined ? value : initialImage;

  const reportError = (error, fallbackMessage = "Something went wrong with the drawing.") => {
    const message = error instanceof Error && error.message ? error.message : fallbackMessage;
    setStatus(message);
    onError?.(error instanceof Error ? error : new Error(message));
  };

  const serialize = (reason) => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!canvas || !baseCanvas) return null;
    try {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = canvas.width;
      outputCanvas.height = canvas.height;
      const outputContext = outputCanvas.getContext("2d");
      if (!outputContext) throw new Error("This browser could not prepare the drawing.");
      if (!transparent) {
        outputContext.fillStyle = backgroundColor;
        outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
      }
      outputContext.drawImage(baseCanvas, 0, 0);
      outputContext.drawImage(canvas, 0, 0);
      const dataUrl = outputCanvas.toDataURL(exportMimeType, clamp(Number(imageQuality) || 0.9, 0.1, 1));
      return {
        dataUrl,
        metadata: Object.freeze({
          width: canvas.width,
          height: canvas.height,
          blobBytes: canvasDataUrlByteSize(dataUrl),
          mimeType: exportMimeType,
          reason
        })
      };
    } catch (error) {
      reportError(error, "This image cannot be exported. Try uploading a local image instead.");
      return null;
    }
  };

  const emitChange = (reason) => {
    if (!onChange) return;
    const result = serialize(reason);
    if (!result) return;
    lastEmittedValueRef.current = result.dataUrl;
    onChange(result.dataUrl, result.metadata);
  };

  const pushUndoSnapshot = () => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    const context = canvas?.getContext("2d");
    const baseContext = baseCanvas?.getContext("2d");
    if (!canvas || !baseCanvas || !context || !baseContext) return;
    try {
      const snapshot = {
        drawing: context.getImageData(0, 0, canvas.width, canvas.height),
        base: baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
        hasArtwork: hasArtworkRef.current,
        hasBaseImage: hasBaseImageRef.current
      };
      const limit = clamp(Math.round(finitePositive(maxHistory) || DEFAULT_MAX_HISTORY), 1, 24);
      historyRef.current = [...historyRef.current.slice(-(limit - 1)), snapshot];
      setCanUndo(true);
    } catch (error) {
      reportError(error, "Undo is unavailable for this image.");
    }
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!canvas || !baseCanvas || (canvas.width === canvasSize.width && canvas.height === canvasSize.height && baseCanvas.width === canvasSize.width && baseCanvas.height === canvasSize.height)) return;
    const previousDrawing = document.createElement("canvas");
    previousDrawing.width = canvas.width;
    previousDrawing.height = canvas.height;
    previousDrawing.getContext("2d")?.drawImage(canvas, 0, 0);
    const previousBase = document.createElement("canvas");
    previousBase.width = baseCanvas.width;
    previousBase.height = baseCanvas.height;
    previousBase.getContext("2d")?.drawImage(baseCanvas, 0, 0);
    const preserveArtwork = hasArtworkRef.current && canvas.width > 0 && canvas.height > 0;
    const preserveBaseImage = hasBaseImageRef.current && baseCanvas.width > 0 && baseCanvas.height > 0;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    baseCanvas.width = canvasSize.width;
    baseCanvas.height = canvasSize.height;
    resetCanvas(canvas, backgroundColor, true);
    resetCanvas(baseCanvas, backgroundColor, true);
    if (preserveArtwork) {
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(previousDrawing, 0, 0, canvas.width, canvas.height);
    }
    if (preserveBaseImage) {
      const baseContext = baseCanvas.getContext("2d");
      baseContext.imageSmoothingEnabled = true;
      baseContext.imageSmoothingQuality = "high";
      baseContext.drawImage(previousBase, 0, 0, baseCanvas.width, baseCanvas.height);
    }
    historyRef.current = [];
    setCanUndo(false);
  }, [canvasSize.width, canvasSize.height]);

  useEffect(() => {
    if (externalSource === lastEmittedValueRef.current) return undefined;
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!canvas || !baseCanvas) return undefined;
    const loadId = ++sourceLoadRef.current;
    historyRef.current = [];
    setCanUndo(false);

    if (!externalSource) {
      resetCanvas(canvas, backgroundColor, true);
      resetCanvas(baseCanvas, backgroundColor, true);
      hasArtworkRef.current = false;
      hasBaseImageRef.current = false;
      setStatus("Ready to draw.");
      return undefined;
    }

    setStatus("Loading image…");
    loadImage(externalSource).then(image => {
      if (sourceLoadRef.current !== loadId) return;
      drawImageToCanvas(baseCanvas, image, imageFit, backgroundColor, true);
      resetCanvas(canvas, backgroundColor, true);
      hasArtworkRef.current = true;
      hasBaseImageRef.current = true;
      setStatus("Image loaded. Ready to draw.");
    }).catch(error => {
      if (sourceLoadRef.current !== loadId) return;
      resetCanvas(canvas, backgroundColor, true);
      resetCanvas(baseCanvas, backgroundColor, true);
      hasArtworkRef.current = false;
      hasBaseImageRef.current = false;
      reportError(error);
    });
    return () => {
      if (sourceLoadRef.current === loadId) sourceLoadRef.current += 1;
    };
  }, [externalSource]);

  useEffect(() => {
    if (!safeBrushSizes.some(entry => entry.id === brushSizeId)) {
      setBrushSizeId(safeBrushSizes[0].id);
    }
  }, [safeBrushSizes, brushSizeId]);

  useEffect(() => {
    if (!readOnly || !activeStrokeRef.current) return;
    activeStrokeRef.current = null;
    setIsDrawing(false);
  }, [readOnly]);

  const finishStroke = (event, cancelled = false) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || (event?.pointerId !== undefined && event.pointerId !== stroke.pointerId)) return;
    if (event?.currentTarget?.hasPointerCapture?.(stroke.pointerId)) {
      event.currentTarget.releasePointerCapture(stroke.pointerId);
    }
    activeStrokeRef.current = null;
    setIsDrawing(false);
    if (!cancelled) {
      hasArtworkRef.current = true;
      setStatus("Stroke added. Undo is available.");
      emitChange("stroke");
    }
  };

  const handlePointerDown = event => {
    if (readOnly || activeStrokeRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pushUndoSnapshot();
    const point = pointOnCanvas(canvas, event);
    const erasing = tool === "eraser";
    paintDot(context, point, activeBrushSize.size, color, erasing, true);
    activeStrokeRef.current = { pointerId: event.pointerId, point };
    setIsDrawing(true);
  };

  const handlePointerMove = event => {
    const stroke = activeStrokeRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!stroke || stroke.pointerId !== event.pointerId || !canvas || !context || readOnly) return;
    event.preventDefault();
    const collectedEvents = event.getCoalescedEvents?.();
    const coalescedEvents = collectedEvents?.length ? collectedEvents : [event];
    const erasing = tool === "eraser";
    for (const pointerEvent of coalescedEvents) {
      const nextPoint = pointOnCanvas(canvas, pointerEvent);
      paintLine(context, stroke.point, nextPoint, activeBrushSize.size, color, erasing, true);
      stroke.point = nextPoint;
    }
  };

  const cancelStroke = event => {
    const stroke = activeStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    const context = canvas?.getContext("2d");
    const baseContext = baseCanvas?.getContext("2d");
    const snapshot = historyRef.current.pop();
    if (context && baseContext && snapshot) {
      context.putImageData(snapshot.drawing, 0, 0);
      baseContext.putImageData(snapshot.base, 0, 0);
      hasArtworkRef.current = snapshot.hasArtwork;
      hasBaseImageRef.current = snapshot.hasBaseImage;
    }
    if (event.currentTarget?.hasPointerCapture?.(stroke.pointerId)) {
      event.currentTarget.releasePointerCapture(stroke.pointerId);
    }
    activeStrokeRef.current = null;
    setIsDrawing(false);
    setCanUndo(historyRef.current.length > 0);
    setStatus("Stroke cancelled.");
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    const context = canvas?.getContext("2d");
    const baseContext = baseCanvas?.getContext("2d");
    const snapshot = historyRef.current.pop();
    if (!canvas || !baseCanvas || !context || !baseContext || !snapshot) return;
    context.putImageData(snapshot.drawing, 0, 0);
    baseContext.putImageData(snapshot.base, 0, 0);
    hasArtworkRef.current = snapshot.hasArtwork;
    hasBaseImageRef.current = snapshot.hasBaseImage;
    setCanUndo(historyRef.current.length > 0);
    setStatus("Last change undone.");
    emitChange("undo");
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!canvas || !baseCanvas) return;
    pushUndoSnapshot();
    resetCanvas(canvas, backgroundColor, true);
    resetCanvas(baseCanvas, backgroundColor, true);
    hasArtworkRef.current = false;
    hasBaseImageRef.current = false;
    setStatus("Canvas cleared. Undo is available.");
    emitChange("clear");
  };

  const handleUpload = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      reportError(new Error("Choose a PNG, JPEG, WebP, GIF or other image file."));
      return;
    }
    const uploadLimit = clamp(Math.round(finitePositive(maxUploadBytes) || DEFAULT_MAX_UPLOAD_BYTES), 100_000, 20_000_000);
    if (file.size > uploadLimit) {
      reportError(new Error(`That image is too large. Choose one under ${Math.round(uploadLimit / 1_000_000)} MB.`));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setStatus("Loading upload…");
    try {
      const image = await loadImage(objectUrl);
      const canvas = canvasRef.current;
      const baseCanvas = baseCanvasRef.current;
      if (!canvas || !baseCanvas) return;
      pushUndoSnapshot();
      drawImageToCanvas(baseCanvas, image, imageFit, backgroundColor, true);
      resetCanvas(canvas, backgroundColor, true);
      hasArtworkRef.current = true;
      hasBaseImageRef.current = true;
      setStatus("Image added. You can draw over it or undo.");
      emitChange("upload");
    } catch (error) {
      reportError(error);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleExport = () => {
    const result = serialize("export");
    if (!result) return;
    setStatus("Drawing ready to use.");
    onExport?.(result.dataUrl, result.metadata);
  };

  return <section className={`simple-paint-editor ${readOnly ? "simple-paint-editor--read-only" : ""} ${className}`.trim()} aria-label={label}>
    {!readOnly && <div className="simple-paint-editor__toolbar" aria-label="Drawing tools">
      <div className="simple-paint-editor__tool-group" role="group" aria-label="Paint tool">
        <button
          className={`simple-paint-editor__tool ${tool === "brush" ? "is-selected" : ""}`}
          type="button"
          aria-pressed={tool === "brush"}
          onClick={() => setTool("brush")}
        >Brush</button>
        <button
          className={`simple-paint-editor__tool ${tool === "eraser" ? "is-selected" : ""}`}
          type="button"
          aria-pressed={tool === "eraser"}
          onClick={() => setTool("eraser")}
        >Eraser</button>
      </div>

      <fieldset className="simple-paint-editor__sizes">
        <legend>Brush size</legend>
        {safeBrushSizes.map(size => <label
          className={`simple-paint-editor__size ${activeBrushSize.id === size.id ? "is-selected" : ""}`}
          key={size.id || size.label}
          title={`${size.label || "Brush"}: ${size.size} pixels`}
        >
          <input
            type="radio"
            name={`${descriptionId}-brush-size`}
            value={size.id}
            checked={activeBrushSize.id === size.id}
            onChange={() => setBrushSizeId(size.id)}
          />
          <span className="simple-paint-editor__size-dot" style={{ width: `${clamp(size.size, 4, 28)}px`, height: `${clamp(size.size, 4, 28)}px` }} aria-hidden="true" />
          <span style={VISUALLY_HIDDEN_STYLE}>{size.label || `${size.size} pixel brush`}</span>
        </label>)}
      </fieldset>

      <div className="simple-paint-editor__actions" role="group" aria-label="Canvas actions">
        <button type="button" onClick={handleUndo} disabled={!canUndo}>Undo</button>
        <button type="button" onClick={handleClear}>{clearLabel}</button>
        {allowUpload && <button type="button" onClick={() => uploadRef.current?.click()}>Upload image</button>}
      </div>
    </div>}

    {!readOnly && <div className="simple-paint-editor__colors" role="group" aria-label="Paint colour">
      <div className="simple-paint-editor__palette">
        {safePalette.map(paletteColor => <button
          className={`simple-paint-editor__swatch ${color.toLowerCase() === paletteColor.toLowerCase() ? "is-selected" : ""}`}
          type="button"
          key={paletteColor}
          onClick={() => {
            setColor(paletteColor);
            setTool("brush");
          }}
          aria-label={`Paint with ${paletteColor}`}
          aria-pressed={color.toLowerCase() === paletteColor.toLowerCase()}
          style={{ "--paint-swatch": paletteColor }}
        />)}
      </div>
      <label className="simple-paint-editor__custom-color">
        <span>Custom colour</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#111214"}
          onChange={event => {
            setColor(event.target.value);
            setTool("brush");
          }}
        />
      </label>
    </div>}

    <div className={`simple-paint-editor__canvas-shell ${isDrawing ? "is-drawing" : ""}`} style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}>
      <canvas
        ref={baseCanvasRef}
        className="simple-paint-editor__canvas simple-paint-editor__canvas--base"
        aria-hidden="true"
        style={{ backgroundColor: transparent ? "transparent" : backgroundColor }}
      />
      <canvas
        ref={canvasRef}
        className="simple-paint-editor__canvas"
        role="img"
        aria-label={label}
        aria-describedby={`${descriptionId} ${statusId}`}
        aria-readonly={readOnly ? "true" : undefined}
        tabIndex="0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={cancelStroke}
        onLostPointerCapture={event => finishStroke(event)}
        style={{ touchAction: readOnly ? "auto" : "none" }}
      />
    </div>
    <p id={descriptionId} style={VISUALLY_HIDDEN_STYLE}>
      {readOnly ? "A saved drawing preview." : "Draw with a mouse, pen or one finger. Choose a colour, brush size or eraser from the controls."}
    </p>
    <p id={statusId} className="simple-paint-editor__status" role="status" aria-live="polite">{status}</p>
    {!readOnly && <input
      ref={uploadRef}
      className="simple-paint-editor__file-input"
      type="file"
      accept="image/*"
      onChange={handleUpload}
      tabIndex="-1"
      aria-hidden="true"
      hidden
    />}
    {showExport && onExport && <div className="simple-paint-editor__export">
      <button type="button" onClick={handleExport}>{exportLabel}</button>
    </div>}
  </section>;
}

export default SimplePaintEditor;
