import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Home from "../page";

describe("Home (landing page)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the headline", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /never be caught off guard/i })
    ).toBeDefined();
  });

  it("renders a Get started link pointing to /signup", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: "Get started" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/signup");
  });

  it("renders a Log in link pointing to /login", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: "Log in" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("renders a subheadline describing the app", () => {
    render(<Home />);
    expect(
      screen.getByText(/calculates exactly what to set aside/i)
    ).toBeDefined();
  });
});
