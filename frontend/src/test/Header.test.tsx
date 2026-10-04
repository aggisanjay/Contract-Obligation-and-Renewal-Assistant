import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "../components/Header";

describe("Header Component", () => {
  it("renders brand name and navigation links", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByText("Contract Assistant")).toBeInTheDocument();
    expect(screen.getByText("Deadlines & Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Contracts")).toBeInTheDocument();
    expect(screen.getByText("Upload Contract")).toBeInTheDocument();
  });

  it("displays demo mode badge when isDemoMode is true", () => {
    render(
      <MemoryRouter>
        <Header isDemoMode={true} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Demo Mode \(Mock AI\)/i)).toBeInTheDocument();
  });

  it("omits demo mode badge when isDemoMode is false", () => {
    render(
      <MemoryRouter>
        <Header isDemoMode={false} />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Demo Mode \(Mock AI\)/i)).not.toBeInTheDocument();
  });
});
