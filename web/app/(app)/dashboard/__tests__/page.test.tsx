import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import DashboardPage from "../page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
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

const mockSnapshot = {
  id: "snap1",
  totalRequired: 4100,
  totalFunded: 3200,
  nextActionAmount: 412,
  nextActionDate: "2025-02-14T00:00:00.000Z",
  nextActionDescription: "Set aside $412.00 for Rent by 2025-02-14",
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockFullyFundedSnapshot = {
  id: "snap2",
  totalRequired: 4100,
  totalFunded: 4100,
  nextActionAmount: 0,
  nextActionDate: "2025-03-01T00:00:00.000Z",
  nextActionDescription: "You're fully covered!",
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockEmptySnapshot = {
  id: "snap3",
  totalRequired: 0,
  totalFunded: 0,
  nextActionAmount: 0,
  nextActionDate: "2025-02-01T00:00:00.000Z",
  nextActionDescription: "Add your first obligation to get started",
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the next action hero card", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }])
        );
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("$412.00")).toBeDefined();
    });

    expect(screen.getByText("Next action")).toBeDefined();
    expect(
      screen.getByText("Set aside $412.00 for Rent by 2025-02-14")
    ).toBeDefined();
    expect(screen.getByText(/Due by/)).toBeDefined();
  });

  it("renders celebration state when fully funded", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }])
        );
      }
      return Promise.resolve(mockFetchResponse(mockFullyFundedSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("You're fully covered!")).toBeDefined();
    });

    expect(
      screen.getByText(/All obligations are fully funded/)
    ).toBeDefined();
  });

  it("renders empty state when no obligations exist", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(mockFetchResponse(mockEmptySnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Welcome to your dashboard")
      ).toBeDefined();
    });

    expect(
      screen.getByText(
        /Add your income sources and obligations/
      )
    ).toBeDefined();

    const incomeLink = screen.getByText("Add income");
    expect(incomeLink).toBeDefined();
    expect(incomeLink.closest("a")?.getAttribute("href")).toBe("/income");

    const obligationsLink = screen.getByText("Add obligations");
    expect(obligationsLink).toBeDefined();
    expect(obligationsLink.closest("a")?.getAttribute("href")).toBe(
      "/obligations"
    );
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(
        mockFetchResponse({ error: "internal server error" }, 500)
      );
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load dashboard data"
      );
    });
  });

  it("renders the page title", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(mockFetchResponse(mockEmptySnapshot));
    });

    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" })
    ).toBeDefined();
  });
});
