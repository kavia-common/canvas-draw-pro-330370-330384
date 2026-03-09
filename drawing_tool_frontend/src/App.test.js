import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function getCanvas() {
  return screen.getByRole("img", { name: /drawing canvas/i });
}

function getToolbar() {
  return screen.getByRole("region", { name: /drawing tools/i });
}

describe("Canvas Draw Pro - UI and interactions", () => {
  test("renders header, toolbar, and canvas", () => {
    render(<App />);

    expect(screen.getByText(/Canvas Draw Pro/i)).toBeInTheDocument();
    expect(getToolbar()).toBeInTheDocument();
    expect(getCanvas()).toBeInTheDocument();

    // Key controls exist
    expect(within(getToolbar()).getByLabelText(/brush/i)).toBeInTheDocument();
    expect(within(getToolbar()).getByLabelText(/pick brush color/i)).toBeInTheDocument();
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
    const colorPicker = within(getToolbar()).getByLabelText(/pick brush color/i);

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

    // Start drawing: pushes undo snapshot (toDataURL) and begins path
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);

    // Move while drawing: should call beginPath/moveTo/lineTo/stroke
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30 });
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();

    // Stop drawing: further moves should not draw
    const prevStrokeCalls = ctx.stroke.mock.calls.length;
    fireEvent.pointerUp(canvas);
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    expect(ctx.stroke.mock.calls.length).toBe(prevStrokeCalls);
  });

  test("undo/redo button enablement changes after drawing, undo, redo", () => {
    render(<App />);

    const canvas = getCanvas();
    canvas.setPointerCapture = jest.fn();

    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });

    // Initially no history
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    // Draw once => undo should become enabled, redo should remain disabled
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas);

    expect(undoButton).not.toBeDisabled();
    expect(redoButton).toBeDisabled();

    // Undo => redo becomes enabled
    fireEvent.click(undoButton);
    expect(redoButton).not.toBeDisabled();

    // Redo => redo becomes disabled again (no further redo)
    fireEvent.click(redoButton);
    expect(redoButton).toBeDisabled();
  });

  test("clear pushes an undo snapshot and clears redo history, enabling undo afterwards", () => {
    render(<App />);

    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });
    const clearButton = within(getToolbar()).getByRole("button", { name: /clear/i });

    // Start with a drawing so redo behavior can be asserted later
    canvas.setPointerCapture = jest.fn();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas);

    // Undo then redo should now be enabled after undo
    fireEvent.click(undoButton);
    expect(redoButton).not.toBeDisabled();

    // Clear should push undo snapshot and also clear redo history
    fireEvent.click(clearButton);

    // Clear draws a white fillRect to wipe the canvas
    expect(ctx.fillRect).toHaveBeenCalled();

    expect(undoButton).not.toBeDisabled();
    expect(redoButton).toBeDisabled();
  });

  test("export creates a download link with PNG data URL and clicks it", async () => {
    const user = userEvent.setup();
    render(<App />);

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

    // jsdom will store href as absolute; just assert it contains our data URL
    expect(String(a.href)).toContain("data:image/png");
    expect(a.download).toBe("drawing.png");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();

    document.createElement.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test("keyboard shortcuts: Ctrl/Cmd+Z triggers undo, Shift+Ctrl/Cmd+Z triggers redo", () => {
    render(<App />);

    const canvas = getCanvas();
    canvas.setPointerCapture = jest.fn();

    const undoButton = within(getToolbar()).getByRole("button", { name: /undo/i });
    const redoButton = within(getToolbar()).getByRole("button", { name: /redo/i });

    // Create undo history
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas);

    expect(undoButton).not.toBeDisabled();
    expect(redoButton).toBeDisabled();

    // Ctrl+Z => undo => redo enabled
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(redoButton).not.toBeDisabled();

    // Shift+Ctrl+Z => redo => redo disabled
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(redoButton).toBeDisabled();
  });
});
