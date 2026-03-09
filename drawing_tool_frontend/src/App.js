import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Drawing tool implementation notes:
 * - Uses a single <canvas> and stores full-image snapshots (data URLs) for undo/redo.
 * - Uses pointer events to support mouse, touch, and pen with one code path.
 * - Canvas is sized to its container and uses devicePixelRatio for crisp drawing.
 */

/**
 * PUBLIC_INTERFACE
 */
function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);

  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState("#111827");
  const [isEraser, setIsEraser] = useState(false);

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const effectiveStrokeStyle = useMemo(() => {
    return isEraser ? "#ffffff" : brushColor;
  }, [isEraser, brushColor]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const getCtx = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const getCanvasSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  };

  const restoreSnapshot = (dataUrl) => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    // Clear to white background
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (!dataUrl) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  };

  const pushUndoSnapshot = () => {
    const snap = getCanvasSnapshot();
    if (!snap) return;
    setUndoStack((prev) => [...prev, snap]);
  };

  const clearCanvas = ({ pushUndo = true } = {}) => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    if (pushUndo) {
      pushUndoSnapshot();
      setRedoStack([]);
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const current = getCanvasSnapshot();
    const last = undoStack[undoStack.length - 1];

    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    if (current) setRedoStack((prev) => [...prev, current]);

    restoreSnapshot(last);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const current = getCanvasSnapshot();
    const next = redoStack[redoStack.length - 1];

    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    if (current) setUndoStack((prev) => [...prev, current]);

    restoreSnapshot(next);
  };

  const getPointFromEvent = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // clientX/Y are in CSS pixels; convert to canvas pixels
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return { x: xCss * scaleX, y: yCss * scaleY };
  };

  const applyBrushSettings = (ctx) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = effectiveStrokeStyle;
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    // Store state for undo at the start of a stroke, then clear redo history.
    pushUndoSnapshot();
    setRedoStack([]);

    isDrawingRef.current = true;
    const p = getPointFromEvent(e);
    lastPointRef.current = p;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (e) => {
    const ctx = getCtx();
    if (!ctx) return;
    if (!isDrawingRef.current) return;

    const p = getPointFromEvent(e);
    const last = lastPointRef.current;

    applyBrushSettings(ctx);

    // Simple line segment drawing
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    lastPointRef.current = p;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the already rendered canvas pixels; create a download link
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resizeCanvasToContainer = ({ preserveDrawing = true } = {}) => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    const ctx = getCtx();
    if (!canvas || !wrap || !ctx) return;

    const prev = preserveDrawing ? getCanvasSnapshot() : null;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Minimum height for usability
    const targetCssWidth = Math.max(320, Math.floor(rect.width));
    const targetCssHeight = Math.max(360, Math.floor(rect.height));

    canvas.style.width = `${targetCssWidth}px`;
    canvas.style.height = `${targetCssHeight}px`;

    canvas.width = Math.floor(targetCssWidth * dpr);
    canvas.height = Math.floor(targetCssHeight * dpr);

    // Reset transforms and ensure drawing matches pixel coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Fill white background (so PNG isn't transparent; and eraser works as white)
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (prev) restoreSnapshot(prev);
  };

  useEffect(() => {
    // Initial sizing
    resizeCanvasToContainer({ preserveDrawing: false });

    const onResize = () => resizeCanvasToContainer({ preserveDrawing: true });
    window.addEventListener("resize", onResize);

    // Handle container resize more precisely (e.g., responsive layout changes)
    let ro = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(() => resizeCanvasToContainer({ preserveDrawing: true }));
      if (canvasWrapRef.current) ro.observe(canvasWrapRef.current);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+Z for undo, Shift+Ctrl/Cmd+Z for redo
  useEffect(() => {
    const onKeyDown = (e) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = String(e.key).toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUndo, canRedo, undoStack, redoStack]);

  return (
    <div className="dt-app">
      <header className="dt-header">
        <div className="dt-brand">
          <div className="dt-logoMark" aria-hidden="true" />
          <div className="dt-brandText">
            <div className="dt-title">Canvas Draw Pro</div>
            <div className="dt-subtitle">Draw with mouse, touch, or pen. Export as PNG.</div>
          </div>
        </div>

        <div className="dt-toolbar" role="region" aria-label="Drawing tools">
          <div className="dt-toolGroup">
            <label className="dt-label" htmlFor="brushSize">
              Brush <span className="dt-labelValue">{brushSize}px</span>
            </label>
            <input
              id="brushSize"
              className="dt-range"
              type="range"
              min={1}
              max={60}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
          </div>

          <div className="dt-toolGroup">
            <label className="dt-label" htmlFor="brushColor">
              Color
            </label>
            <div className="dt-colorRow">
              <input
                id="brushColor"
                className="dt-color"
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                disabled={isEraser}
                aria-label="Pick brush color"
              />
              <div className="dt-colorSwatch" style={{ backgroundColor: effectiveStrokeStyle }} aria-hidden="true" />
            </div>
          </div>

          <div className="dt-toolGroup dt-toolGroupButtons">
            <button
              type="button"
              className={`dt-btn ${isEraser ? "dt-btnActive" : ""}`}
              onClick={() => setIsEraser((v) => !v)}
              aria-pressed={isEraser}
              title="Toggle eraser"
            >
              Eraser
            </button>

            <button type="button" className="dt-btn" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
              Undo
            </button>
            <button
              type="button"
              className="dt-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Shift+Ctrl/Cmd+Z)"
            >
              Redo
            </button>

            <button
              type="button"
              className="dt-btn dt-btnDanger"
              onClick={() => clearCanvas({ pushUndo: true })}
              title="Clear canvas"
            >
              Clear
            </button>

            <button type="button" className="dt-btn dt-btnPrimary" onClick={exportPng} title="Export as PNG">
              Export PNG
            </button>
          </div>
        </div>
      </header>

      <main className="dt-main">
        <section className="dt-canvasCard" aria-label="Drawing canvas">
          <div className="dt-canvasWrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              className="dt-canvas"
              role="img"
              aria-label="Drawing canvas"
              onPointerDown={(e) => {
                // Capture pointer so drawing continues even if the pointer leaves the canvas.
                // In jsdom/tests, PointerEvent support can be partial and `pointerId` may be undefined.
                // Guard to avoid throwing and to keep drawing/undo logic working in all environments.
                const pointerId = e?.pointerId;
                const canCapture =
                  typeof e?.currentTarget?.setPointerCapture === "function" &&
                  typeof pointerId === "number" &&
                  Number.isFinite(pointerId);

                if (canCapture) {
                  e.currentTarget.setPointerCapture(pointerId);
                }

                startDrawing(e);
              }}
              onPointerMove={(e) => {
                // Prevent scrolling while drawing on touch devices
                if (isDrawingRef.current) e.preventDefault();
                draw(e);
              }}
              onPointerUp={() => stopDrawing()}
              onPointerCancel={() => stopDrawing()}
              onPointerLeave={() => stopDrawing()}
            />
          </div>

          <div className="dt-hints">
            <div className="dt-hint">
              Tip: Use <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> to undo, <kbd>Shift</kbd>+<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>{" "}
              to redo.
            </div>
            <div className="dt-hint">
              The eraser paints with white (matching the canvas background) for fast, predictable exports.
            </div>
          </div>
        </section>
      </main>

      <footer className="dt-footer">
        <div className="dt-footerInner">
          <span className="dt-footerBadge">Light theme</span>
          <span className="dt-footerText">Built with HTML5 Canvas + React</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
