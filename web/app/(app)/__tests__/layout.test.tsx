import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AppLayout from "../layout";
import { WhatIfProvider } from "@/app/contexts/WhatIfContext";
import type { ReactNode } from "react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: mockPush })),
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

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderWithProvider(ui: ReactNode) {
  return render(<WhatIfProvider>{ui}</WhatIfProvider>);
}

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nav and children", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    renderWithProvider(
      <AppLayout>
        <div data-testid="child-content">Hello</div>
      </AppLayout>
    );

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeDefined();
    expect(screen.getByTestId("child-content")).toBeDefined();
    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("renders a logout button", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    renderWithProvider(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    expect(logoutButton).toBeDefined();
  });

  it("logout button calls API and redirects to login", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockFetchResponse({ suggestions: [], count: 0 }))
      .mockResolvedValueOnce(mockFetchResponse({ success: true }));

    renderWithProvider(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("renders main content area", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    renderWithProvider(
      <AppLayout>
        <p>Dashboard content here</p>
      </AppLayout>
    );

    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByText("Dashboard content here")).toBeDefined();
  });

  it("renders the AI bar", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    renderWithProvider(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );

    expect(screen.getByTestId("ai-bar")).toBeDefined();
    expect(screen.getByRole("button", { name: "Open AI assistant" })).toBeDefined();
  });
});
