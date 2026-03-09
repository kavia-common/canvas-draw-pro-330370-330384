import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders drawing tool header", () => {
  render(<App />);
  expect(screen.getByText(/Canvas Draw Pro/i)).toBeInTheDocument();
});
