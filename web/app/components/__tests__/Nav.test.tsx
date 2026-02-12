import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import Nav from "../Nav";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    "aria-current"?: "page" | "step" | "location" | "date" | "time" | "true" | "false" | boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all navigation links", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<Nav />);

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Income")).toBeDefined();
    expect(screen.getByText("Obligations")).toBeDefined();
    expect(screen.getByText("Import")).toBeDefined();
    expect(screen.getByText("Transactions")).toBeDefined();
    expect(screen.getByText("Suggestions")).toBeDefined();
  });

  it("shows badge when pending suggestions count is greater than 0", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 5 })
    );

    render(<Nav />);

    await waitFor(() => {
      expect(screen.getByText("5")).toBeDefined();
    });

    const badge = screen.getByLabelText("5 pending suggestions");
    expect(badge).toBeDefined();
  });

  it("hides badge when count is 0", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<Nav />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/suggestions");
    });

    expect(screen.queryByLabelText(/pending suggestions/)).toBeNull();
  });

  it("hides badge when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: "internal server error" }, 500)
    );

    render(<Nav />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/suggestions");
    });

    expect(screen.queryByLabelText(/pending suggestions/)).toBeNull();
  });

  it("renders the nav element with accessible label", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<Nav />);

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeDefined();
  });

  it("updates badge after suggestions are acted on", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 3 })
    );

    render(<Nav />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeDefined();
    });

    const badge = screen.getByLabelText("3 pending suggestions");
    expect(badge).toBeDefined();
  });
});
