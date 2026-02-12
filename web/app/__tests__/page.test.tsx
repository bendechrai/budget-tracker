import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Home from "../page";

describe("Home (landing page)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Sinking Fund" })).toBeDefined();
  });

  it("renders a Sign up link pointing to /signup", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/signup");
  });

  it("renders a Log in link pointing to /login", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: "Log in" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("renders a subtitle describing the app", () => {
    render(<Home />);
    expect(
      screen.getByText(/take control of your finances/i)
    ).toBeDefined();
  });
});
