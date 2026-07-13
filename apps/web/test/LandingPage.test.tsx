import { render, screen } from "@testing-library/react";
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
        name: "Agents claim completion. ShipCheck produces acceptance.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Bounded public-web scope" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "API usage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the demo acceptance report" }),
    ).toHaveAttribute("href", "/reports/demo");
  });

  it("has no serious accessibility violations on the landing page", async () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
