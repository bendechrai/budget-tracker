import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import SuggestionsCard from "../SuggestionsCard";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockSuggestions = [
  {
    id: "s1",
    type: "expense",
    vendorPattern: "Netflix",
    detectedAmount: 22.99,
    detectedIntervalUnit: "month",
    detectedIntervalCount: 1,
  },
  {
    id: "s2",
    type: "expense",
    vendorPattern: "Spotify",
    detectedAmount: 14.99,
    detectedIntervalUnit: "month",
    detectedIntervalCount: 1,
  },
  {
    id: "s3",
    type: "income",
    vendorPattern: "Employer Co",
    detectedAmount: 3500,
    detectedIntervalUnit: "week",
    detectedIntervalCount: 2,
  },
];

describe("SuggestionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing while loading", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    const { container } = render(<SuggestionsCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders suggestions list when data is available", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: mockSuggestions, count: 3 })
    );

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByTestId("suggestions-card")).toBeDefined();
    });

    expect(screen.getByText("Suggestions")).toBeDefined();
    expect(screen.getByText("Netflix")).toBeDefined();
    expect(screen.getByText("Spotify")).toBeDefined();
    expect(screen.getByText("Employer Co")).toBeDefined();
  });

  it("shows frequency short labels and amounts", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: mockSuggestions, count: 3 })
    );

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Netflix: $22.99 — expense (interval: 1 month)
    expect(screen.getByText(/\$22\.99.*expense/)).toBeDefined();
    // Employer Co: $3500.00 — income (interval: 2 weeks)
    expect(screen.getByText(/\$3500\.00.*income/)).toBeDefined();
  });

  it("renders empty state when no suggestions exist", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByTestId("suggestions-empty")).toBeDefined();
    });

    expect(screen.getByText("No new suggestions")).toBeDefined();
    expect(screen.queryByTestId("suggestions-view-all")).toBeNull();
  });

  it("renders 'View all suggestions' link when suggestions exist", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: mockSuggestions, count: 3 })
    );

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByTestId("suggestions-view-all")).toBeDefined();
    });

    const link = screen.getByTestId("suggestions-view-all");
    expect(link.closest("a")?.getAttribute("href")).toBe("/suggestions");
  });

  it("limits display to 5 suggestions", async () => {
    const manySuggestions = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      type: "expense",
      vendorPattern: `Vendor ${i}`,
      detectedAmount: 10 + i,
      detectedIntervalUnit: "month",
      detectedIntervalCount: 1,
    }));

    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: manySuggestions, count: 8 })
    );

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByText("Vendor 0")).toBeDefined();
    });

    // Should only show first 5
    expect(screen.getByText("Vendor 4")).toBeDefined();
    expect(screen.queryByText("Vendor 5")).toBeNull();
  });

  it("handles fetch error gracefully", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    render(<SuggestionsCard />);

    await waitFor(() => {
      expect(screen.getByTestId("suggestions-empty")).toBeDefined();
    });

    expect(screen.getByText("No new suggestions")).toBeDefined();
  });
});
