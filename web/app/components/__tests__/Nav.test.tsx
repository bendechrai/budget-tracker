import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Nav from "../Nav";
import { usePathname } from "next/navigation";

let mockCount = 0;

vi.mock("@/app/contexts/SuggestionsCountContext", () => ({
  useSuggestionsCount: () => ({
    count: mockCount,
    decrement: vi.fn(),
    refresh: vi.fn(),
  }),
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

describe("Nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all navigation links", () => {
    render(<Nav />);

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Income")).toBeDefined();
    expect(screen.getByText("Obligations")).toBeDefined();
    expect(screen.getByText("Import")).toBeDefined();
    expect(screen.getByText("Transactions")).toBeDefined();
    expect(screen.getByText("Suggestions")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("shows badge when pending suggestions count is greater than 0", () => {
    mockCount = 5;
    render(<Nav />);

    expect(screen.getByText("5")).toBeDefined();
    const badge = screen.getByLabelText("5 pending suggestions");
    expect(badge).toBeDefined();
  });

  it("hides badge when count is 0", () => {
    mockCount = 0;
    render(<Nav />);

    expect(screen.queryByLabelText(/pending suggestions/)).toBeNull();
  });

  it("renders the nav element with accessible label", () => {
    render(<Nav />);

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeDefined();
  });

  it("shows correct badge count", () => {
    mockCount = 3;
    render(<Nav />);

    const badge = screen.getByLabelText("3 pending suggestions");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("3");
  });

  it("highlights the active link based on current pathname", () => {
    render(<Nav />);

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.getAttribute("aria-current")).toBe("page");

    const incomeLink = screen.getByText("Income").closest("a");
    expect(incomeLink?.getAttribute("aria-current")).toBeNull();

    const obligationsLink = screen.getByText("Obligations").closest("a");
    expect(obligationsLink?.getAttribute("aria-current")).toBeNull();
  });

  it("highlights a different link when pathname changes", () => {
    vi.mocked(usePathname).mockReturnValue("/obligations");

    render(<Nav />);

    const obligationsLink = screen.getByText("Obligations").closest("a");
    expect(obligationsLink?.getAttribute("aria-current")).toBe("page");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.getAttribute("aria-current")).toBeNull();
  });

  it("Settings link renders and highlights when active", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");

    render(<Nav />);

    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).toBeDefined();
    expect(settingsLink?.getAttribute("href")).toBe("/settings");
    expect(settingsLink?.getAttribute("aria-current")).toBe("page");
  });
});
