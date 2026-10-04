import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegalDisclaimerBanner } from "../components/LegalDisclaimerBanner";

describe("LegalDisclaimerBanner Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the persistent footer disclaimer banner with required text", () => {
    localStorage.setItem("hasSeenFirstUseLegalNotice", "true");
    render(<LegalDisclaimerBanner />);

    const footerText = screen.getByText(/This tool organizes contract information\. It does not provide legal advice\./i);
    expect(footerText).toBeInTheDocument();
  });

  it("shows first-use modal if user has not acknowledged notice before", () => {
    render(<LegalDisclaimerBanner />);

    // Modal title should appear
    expect(screen.getByText("Welcome to Contract Assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I Understand & Acknowledge/i })).toBeInTheDocument();

    // Clicking acknowledge sets localStorage and closes modal
    fireEvent.click(screen.getByRole("button", { name: /I Understand & Acknowledge/i }));

    expect(localStorage.getItem("hasSeenFirstUseLegalNotice")).toBe("true");
    expect(screen.queryByText("Welcome to Contract Assistant")).not.toBeInTheDocument();
  });

  it("does not show first-use modal if localStorage flag is already set", () => {
    localStorage.setItem("hasSeenFirstUseLegalNotice", "true");
    render(<LegalDisclaimerBanner />);

    expect(screen.queryByText("Welcome to Contract Assistant")).not.toBeInTheDocument();
  });
});
