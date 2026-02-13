import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NudgeCards from "../NudgeCards";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const highConfidenceSuggestions = [
  {
    id: "s1",
    type: "expense",
    vendorPattern: "Spotify",
    detectedAmount: 14.99,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedFrequency: "monthly",
    confidence: "high",
    matchingTransactionCount: 5,
  },
  {
    id: "s2",
    type: "income",
    vendorPattern: "Acme Corp",
    detectedAmount: 3500,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedFrequency: "monthly",
    confidence: "high",
    matchingTransactionCount: 4,
  },
];

const mixedConfidenceSuggestions = [
  ...highConfidenceSuggestions,
  {
    id: "s3",
    type: "expense",
    vendorPattern: "Random Shop",
    detectedAmount: 42.5,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedFrequency: "monthly",
    confidence: "medium",
    matchingTransactionCount: 2,
  },
  {
    id: "s4",
    type: "expense",
    vendorPattern: "Other Store",
    detectedAmount: 10,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedFrequency: "weekly",
    confidence: "low",
    matchingTransactionCount: 2,
  },
];

describe("NudgeCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nudge cards for high-confidence suggestions", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: highConfidenceSuggestions,
        count: highConfidenceSuggestions.length,
      })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(screen.getByText(/Spotify/)).toBeDefined();
    });

    expect(screen.getByText(/\$14\.99/)).toBeDefined();
    expect(screen.getByText(/Acme Corp/)).toBeDefined();
    expect(screen.getByText(/\$3500\.00/)).toBeDefined();
  });

  it("only shows high-confidence suggestions, not medium or low", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: mixedConfidenceSuggestions,
        count: mixedConfidenceSuggestions.length,
      })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(screen.getByText(/Spotify/)).toBeDefined();
    });

    expect(screen.getByText(/Acme Corp/)).toBeDefined();
    expect(screen.queryByText(/Random Shop/)).toBeNull();
    expect(screen.queryByText(/Other Store/)).toBeNull();
  });

  it("renders nothing when no high-confidence suggestions exist", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: [
          {
            id: "s3",
            type: "expense",
            vendorPattern: "Random Shop",
            detectedAmount: 42.5,
            detectedAmountMin: null,
            detectedAmountMax: null,
            detectedFrequency: "monthly",
            confidence: "medium",
            matchingTransactionCount: 2,
          },
        ],
        count: 1,
      })
    );

    render(<NudgeCards />);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("nudge-cards")).toBeNull();
  });

  it("renders nothing when suggestions list is empty", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("nudge-cards")).toBeNull();
  });

  it("dismiss button removes the nudge card", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({
          suggestions: highConfidenceSuggestions,
          count: highConfidenceSuggestions.length,
        })
      )
      .mockResolvedValueOnce(mockFetchResponse({ success: true }));

    const user = userEvent.setup();
    render(<NudgeCards />);

    await waitFor(() => {
      expect(screen.getByText(/Spotify/)).toBeDefined();
    });

    const dismissButton = screen.getByLabelText("Dismiss Spotify");
    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText(/Spotify/)).toBeNull();
    });

    // Acme Corp should still be visible
    expect(screen.getByText(/Acme Corp/)).toBeDefined();

    // Verify dismiss API was called
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/suggestions/s1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ action: "dismiss" }),
      })
    );
  });

  it("has a link to the suggestions feed", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: [highConfidenceSuggestions[0]],
        count: 1,
      })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(screen.getByText(/Spotify/)).toBeDefined();
    });

    const reviewLink = screen.getByText("Review");
    expect(reviewLink.getAttribute("href")).toBe("/suggestions");
  });

  it("shows correct text for expense type", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: [highConfidenceSuggestions[0]],
        count: 1,
      })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(
        screen.getByText(/monthly charge from Spotify/)
      ).toBeDefined();
    });
  });

  it("shows correct text for income type", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        suggestions: [highConfidenceSuggestions[1]],
        count: 1,
      })
    );

    render(<NudgeCards />);

    await waitFor(() => {
      expect(
        screen.getByText(/monthly income from Acme Corp/)
      ).toBeDefined();
    });
  });
});
