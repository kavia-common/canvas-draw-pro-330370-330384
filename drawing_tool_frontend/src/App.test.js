import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function getCanvas() {
  return screen.getByRole("img", { name: /drawing canvas/i });
}

function getToolbar() {
  return screen.getByRole("region", { name: /drawing tools/i });
}

function getBrushSizeSlider() {
  // Unambiguous: the range input is labelled by the visible "Brush" <label>
  return within(getToolbar()).getByRole("slider", { name: /^brush/i });
}

function getColorPicker() {
  return within(getToolbar()).getByLabelText(/pick brush color/i);
}

function pointerDown(el, { pointerId = 1, clientX = 10, clientY = 10 } = {}) {
  fireEvent.pointerDown(el, { pointerId, clientX, clientY });
}

function pointerMove(el, { pointerId = 1, clientX = 20, clientY = 20 } = {}) {
  fireEvent.pointerMove(el, { pointerId, clientX, clientY });
}

function pointerUp(el, { pointerId = 1 } = {}) {
  fireEvent.pointerUp(el, { pointerId });
}

describe("Canvas Draw Pro - UI and interactions", () => {
  test("renders header, toolbar, and canvas", () => {
    render(<App />);

    expect(screen.getByText(/Canvas Draw Pro/i)).toBeInTheDocument();
    expect(getToolbar()).toBeInTheDocument();
    expect(getCanvas()).toBeInTheDocument();

    // Key controls exist (use unambiguous queries)
    expect(getBrushSizeSlider()).toBeInTheDocument();
    expect(getColorPicker()).toBeInTheDocument();
    expect(within(getToolbar()).getByRole("button", { name: /eraser/i })).toBeInTheDocument();
    expect(within(getToolbar()).getByRole("button", { name: /undo/i })).toBeInTheDocument();
    expect(within(getToolbar()).getByRole("button", { name: /redo/i })).toBeInTheDocument();
    expect(within(getToolbar()).getByRole("button", { name: /clear/i })).toBeInTheDocument();
    expect(within(getToolbar()).getByRole("button", { name: /export png/i })).toBeInTheDocument();
  });

  test("eraser toggles aria-pressed and disables the color picker", async () => {
    const user = userEvent.setup();
    render(<App />);

    const eraserButton = within(getToolbar()).getByRole("button", { name: /eraser/i });
    const colorPicker = getColorPicker();

    expect(eraserButton).toHaveAttribute("aria-pressed", "false");
    expect(colorPicker).not.toBeDisabled();

    await user.click(eraserButton);
    expect(eraserButton).toHaveAttribute("aria-pressed", "true");
    expect(colorPicker).toBeDisabled();

    await user.click(eraserButton);
    expect(eraserButton).toHaveAttribute("aria-pressed", "false");
    expect(colorPicker).not.toBeDisabled();
  });

  test("drawing on canvas uses pointer events and calls 2D context stroke pipeline", () => {
    render(<App />);

    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");

    // The component captures the pointer; jsdom doesn't implement setPointerCapture, so mock it.
    canvas.setPointerCapture = jest.fn();

    pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1);
    // jsdom may not provide a real PointerEvent with pointerId; component guards against this.
    // If pointerId is available, it will be passed through; otherwise we only assert it was called.
    const arg = canvas.setPointerCapture.mock.calls[0]?.[0];
    if (typeof arg === "number") {
      expect(arg).toBe(1);
    }

    pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();

    // Stop drawing: further moves should not draw
    const prevStrokeCalls = ctx.stroke.mock.calls.length;
    pointerUp(canvas, { pointerId: 1 });
    pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 60 });
    expect(ctx.stroke.mock.calls.length).toBe(prevStrokeCalls);
  });

  test("undo/redo button enablement changes after drawing, undo, redo", async () => {
    render(<App />);

    const canvas = getCanvas();
    canvas.setPointerCapture = jest.fn();

    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });

    // Initially no history
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    // Draw once => undo should become enabled, redo should remain disabled
    pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 20 });
    pointerUp(canvas, { pointerId: 1 });

    await waitFor(() => expect(undoButton).not.toBeDisabled());
    expect(redoButton).toBeDisabled();

    // Undo => redo becomes enabled
    fireEvent.click(undoButton);
    await waitFor(() => expect(redoButton).not.toBeDisabled());

    // Redo => redo becomes disabled again (no further redo)
    fireEvent.click(redoButton);
    await waitFor(() => expect(redoButton).toBeDisabled());
  });

  test("clear pushes an undo snapshot and clears redo history, enabling undo afterwards", async () => {
    render(<App />);

    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });
    const clearButton = within(getToolbar()).getByRole("button", { name: /clear/i });

    // Start with a drawing so redo behavior can be asserted later
    canvas.setPointerCapture = jest.fn();
    pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 20 });
    pointerUp(canvas, { pointerId: 1 });

    await waitFor(() => expect(undoButton).not.toBeDisabled());

    // Undo then redo should now be enabled after undo
    fireEvent.click(undoButton);
    await waitFor(() => expect(redoButton).not.toBeDisabled());

    // Clear should push undo snapshot and also clear redo history
    fireEvent.click(clearButton);

    // Clear draws a white fillRect to wipe the canvas
    expect(ctx.fillRect).toHaveBeenCalled();

    await waitFor(() => expect(undoButton).not.toBeDisabled());
    await waitFor(() => expect(redoButton).toBeDisabled());
  });

  test("export creates a download link with PNG data URL and clicks it", async () => {
    const user = userEvent.setup();
    render(<App />);

    const canvas = getCanvas();
    // Most reliable: stub toDataURL on the actual element instance used by the component.
    canvas.toDataURL = jest.fn(() => "data:image/png;base64,export-mock");

    const exportButton = within(getToolbar()).getByRole("button", { name: /export png/i });

    const appendSpy = jest.spyOn(document.body, "appendChild");
    const removeSpy = jest.spyOn(document.body, "removeChild");

    // Intercept the anchor to assert fields + click
    const originalCreate = document.createElement.bind(document);
    const clickSpy = jest.fn();
    const createdAnchors = [];

    jest.spyOn(document, "createElement").mockImplementation((tagName) => {
      const el = originalCreate(tagName);
      if (String(tagName).toLowerCase() === "a") {
        el.click = clickSpy;
        createdAnchors.push(el);
      }
      return el;
    });

    await user.click(exportButton);

    expect(createdAnchors.length).toBe(1);
    const a = createdAnchors[0];

    expect(String(a.href)).toContain("data:image/png");
    expect(a.download).toBe("drawing.png");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();

    document.createElement.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test("keyboard shortcuts: Ctrl/Cmd+Z triggers undo, Shift+Ctrl/Cmd+Z triggers redo", async () => {
    render(<App />);

    const canvas = getCanvas();
    canvas.setPointerCapture = jest.fn();

    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });

    // Create undo history
    pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 20 });
    pointerUp(canvas, { pointerId: 1 });

    await waitFor(() => expect(undoButton).not.toBeDisabled());
    expect(redoButton).toBeDisabled();

    // Ctrl+Z => undo => redo enabled
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(redoButton).not.toBeDisabled());

    // Shift+Ctrl+Z => redo => redo disabled
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(redoButton).toBeDisabled());
  });
});
