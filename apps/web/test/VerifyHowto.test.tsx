import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VerifyHowto } from "../src/components/VerifyHowto.js";

describe("VerifyHowto", () => {
  it("updates the generated agent prompt when fields change", async () => {
    const user = userEvent.setup();
    render(<VerifyHowto />);

    const brief = screen.getByLabelText(/Brief/i);
    const url = screen.getByLabelText(/Delivery URL/i);

    await user.clear(brief);
    await user.type(
      brief,
      "Ship a public pricing page with a working waitlist.",
    );
    await user.clear(url);
    await user.type(url, "https://shipcheck-web.vercel.app/");

    expect(
      screen.getByLabelText(/Generated agent prompt for ShipCheck verify/i),
    ).toHaveTextContent("https://shipcheck-web.vercel.app/");
    expect(
      screen.getByLabelText(/Generated agent prompt for ShipCheck verify/i),
    ).toHaveTextContent("Ship a public pricing page with a working waitlist.");
  });

  it("switches to a live curl payload", async () => {
    const user = userEvent.setup();
    render(<VerifyHowto />);

    await user.click(screen.getByRole("tab", { name: "curl" }));

    expect(
      screen.getByLabelText(/Generated curl for ShipCheck verify/i),
    ).toHaveTextContent("curl -i -X POST");
    expect(
      screen.getByLabelText(/Generated curl for ShipCheck verify/i),
    ).toHaveTextContent("/v1/verify");
  });

  it("copies the current output to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<VerifyHowto />);
    await user.click(screen.getByRole("button", { name: "Copy agent prompt" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(String(writeText.mock.calls[0]?.[0])).toContain("POST ");
    expect(String(writeText.mock.calls[0]?.[0])).toContain("/v1/verify");
  });
});
