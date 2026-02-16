import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollapsibleSection from "../CollapsibleSection";

describe("CollapsibleSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title and children when expanded", () => {
    render(
      <CollapsibleSection title="Test Section" expanded={true} onToggle={vi.fn()}>
        <p>Section content</p>
      </CollapsibleSection>
    );

    expect(screen.getByRole("button", { name: /Test Section/ })).toBeDefined();
    expect(screen.getByText("Section content")).toBeDefined();
  });

  it("has aria-expanded=true when expanded", () => {
    render(
      <CollapsibleSection title="Test Section" expanded={true} onToggle={vi.fn()}>
        <p>Content</p>
      </CollapsibleSection>
    );

    expect(
      screen.getByRole("button", { name: /Test Section/ }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("hides content and sets aria-expanded=false when collapsed", () => {
    render(
      <CollapsibleSection title="Test Section" expanded={false} onToggle={vi.fn()}>
        <p>Section content</p>
      </CollapsibleSection>
    );

    expect(screen.queryByText("Section content")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Test Section/ }).getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("calls onToggle when header is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Test Section" expanded={true} onToggle={onToggle}>
        <p>Section content</p>
      </CollapsibleSection>
    );

    await user.click(screen.getByRole("button", { name: /Test Section/ }));

    expect(onToggle).toHaveBeenCalledOnce();
  });
});
