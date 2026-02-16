import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import Nav from "../Nav";
import { usePathname } from "next/navigation";

let mockCount = 0;

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

vi.mock("@/app/contexts/SuggestionsCountContext", () => ({
  useSuggestionsCount: () => ({
    count: mockCount,
    decrement: vi.fn(),
    refresh: vi.fn(),
  }),
}));

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
    "aria-current"?: "page" | "step" | "location" | "date" | "time" | "true" | "false" | boolean;
    onClick?: () => void;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function getDesktopNav() {
  return screen.getByRole("navigation", { name: "Main navigation" });
}

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
    const nav = getDesktopNav();

    expect(within(nav).getByText("Dashboard")).toBeDefined();
    expect(within(nav).getByText("Income")).toBeDefined();
    expect(within(nav).getByText("Obligations")).toBeDefined();
    expect(within(nav).getByText("Import")).toBeDefined();
    expect(within(nav).getByText("Transactions")).toBeDefined();
    expect(within(nav).getByText("Suggestions")).toBeDefined();
    expect(within(nav).getByText("Settings")).toBeDefined();
  });

  it("shows badge when pending suggestions count is greater than 0", () => {
    mockCount = 5;
    render(<Nav />);
    const nav = getDesktopNav();

    expect(within(nav).getByText("5")).toBeDefined();
    const badge = within(nav).getByLabelText("5 pending suggestions");
    expect(badge).toBeDefined();
  });

  it("hides badge when count is 0", () => {
    mockCount = 0;
    render(<Nav />);
    const nav = getDesktopNav();

    expect(within(nav).queryByLabelText(/pending suggestions/)).toBeNull();
  });

  it("renders the nav element with accessible label", () => {
    render(<Nav />);

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeDefined();
  });

  it("shows correct badge count", () => {
    mockCount = 3;
    render(<Nav />);
    const nav = getDesktopNav();

    const badge = within(nav).getByLabelText("3 pending suggestions");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("3");
  });

  it("highlights the active link based on current pathname", () => {
    render(<Nav />);
    const nav = getDesktopNav();

    const dashboardLink = within(nav).getByText("Dashboard").closest("a");
    expect(dashboardLink?.getAttribute("aria-current")).toBe("page");

    const incomeLink = within(nav).getByText("Income").closest("a");
    expect(incomeLink?.getAttribute("aria-current")).toBeNull();

    const obligationsLink = within(nav).getByText("Obligations").closest("a");
    expect(obligationsLink?.getAttribute("aria-current")).toBeNull();
  });

  it("highlights a different link when pathname changes", () => {
    vi.mocked(usePathname).mockReturnValue("/obligations");

    render(<Nav />);
    const nav = getDesktopNav();

    const obligationsLink = within(nav).getByText("Obligations").closest("a");
    expect(obligationsLink?.getAttribute("aria-current")).toBe("page");

    const dashboardLink = within(nav).getByText("Dashboard").closest("a");
    expect(dashboardLink?.getAttribute("aria-current")).toBeNull();
  });

  it("Settings link renders and highlights when active", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");

    render(<Nav />);
    const nav = getDesktopNav();

    const settingsLink = within(nav).getByText("Settings").closest("a");
    expect(settingsLink).toBeDefined();
    expect(settingsLink?.getAttribute("href")).toBe("/settings");
    expect(settingsLink?.getAttribute("aria-current")).toBe("page");
  });
});
