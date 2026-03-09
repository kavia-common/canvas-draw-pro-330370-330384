// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

/**
 * JSDOM does not implement canvas APIs. The app uses:
 * - canvas.getContext("2d")
 * - ctx: setTransform, beginPath/moveTo/lineTo/stroke, fillRect, drawImage, etc.
 * - canvas.toDataURL()
 *
 * We provide lightweight mocks sufficient for unit tests. The goal is not pixel
 * correctness, but to ensure our React logic wires to the canvas API as expected.
 */
const createMock2dContext = () => {
  return {
    // state stack
    save: jest.fn(),
    restore: jest.fn(),

    // drawing state
    setTransform: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    drawImage: jest.fn(),

    // properties the app assigns
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 1,
    strokeStyle: "#000000",
    fillStyle: "#ffffff",
    globalCompositeOperation: "source-over",
  };
};

beforeAll(() => {
  // Keep a stable 2d context per canvas element instance.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function getContext(type) {
      if (type !== "2d") return null;
      if (!this.__mockCtx2d) {
        this.__mockCtx2d = createMock2dContext();
      }
      return this.__mockCtx2d;
    },
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: jest.fn(() => "data:image/png;base64,mock"),
  });

  // The app calls getBoundingClientRect on the canvas and its wrapper to map points and size.
  // Default to a sensible, non-zero rect unless overridden in a test.
  if (!Element.prototype.getBoundingClientRect.__isMock) {
    const original = Element.prototype.getBoundingClientRect;
    const mock = function getBoundingClientRect() {
      // Use inline style width/height if present; else default.
      const width = Number.parseFloat(this.style?.width) || 800;
      const height = Number.parseFloat(this.style?.height) || 600;

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => {},
      };
    };
    mock.__isMock = true;
    mock.__original = original;
    // eslint-disable-next-line no-extend-native
    Element.prototype.getBoundingClientRect = mock;
  }

  // ResizeObserver is not available in Jest/jsdom by default in CRA environments.
  if (!("ResizeObserver" in window)) {
    class MockResizeObserver {
      constructor(callback) {
        this._callback = callback;
      }
      observe() {
        // No-op: tests can manually trigger window resize events instead.
      }
      unobserve() {}
      disconnect() {}
    }
    // eslint-disable-next-line no-undef
    window.ResizeObserver = MockResizeObserver;
  }

  // Image() is used by restoreSnapshot(). Provide an implementation that triggers onload.
  // Note: In tests we don't validate rasterization; we validate that drawImage is called.
  class MockImage {
    constructor() {
      this._src = "";
      this.onload = null;
    }
    set src(v) {
      this._src = v;
      // simulate async load
      setTimeout(() => {
        if (typeof this.onload === "function") this.onload();
      }, 0);
    }
    get src() {
      return this._src;
    }
  }
  // eslint-disable-next-line no-undef
  global.Image = MockImage;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});
