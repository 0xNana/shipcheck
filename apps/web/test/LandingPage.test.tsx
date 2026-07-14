import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { LandingPage } from "../src/pages/LandingPage.js";

describe("LandingPage", () => {
  it("shows the canonical acceptance copy and demo report link", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Your agent says it’s done. Is it verifiable?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Agent Acceptance Layer")).toBeInTheDocument();
    expect(screen.getByText("Do not trust “done.” Verify it.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How to run a verify" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /How to run a verify/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/Brief/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Bounded public-web scope" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "How to run a verify" }),
    ).toHaveAttribute("href", "#howto");
    expect(screen.getByRole("contentinfo", { name: "Site" })).toBeInTheDocument();
    expect(
      screen.getByText("Completion is a claim. Acceptance requires evidence.", {
        selector: ".site-footer__tagline",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Verify a delivery — open the demo acceptance report",
      }),
    ).toHaveAttribute("href", "/reports/demo");
  });

  it("expands and collapses the how-to panel on toggle", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: /How to run a verify/i });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/Brief/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agent prompt" })).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/Brief/i)).not.toBeInTheDocument();
  });

  it("has no serious accessibility violations on the landing page", async () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(
      await axe(container, { rules: { "color-contrast": { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
