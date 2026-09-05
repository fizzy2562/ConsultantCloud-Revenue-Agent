import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChatApp } from "../components/ChatApp";

describe("ChatApp", () => {
  it("shows a confirmation card as its own element when the renewal flow is started", () => {
    render(<ChatApp />);
    const starter = screen.getByText(
      "Renew Acme University for 3 years and increase Cloud Pro to 250 seats."
    );
    fireEvent.click(starter);
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(within(alert).getByText("Ready to create renewal quote")).toBeTruthy();
  });

  it("never shows a confirmation card for the 30% discount rejection flow", () => {
    render(<ChatApp />);
    const starter = screen.getByText(
      "Try to give Acme University a 30% discount."
    );
    fireEvent.click(starter);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the confirmation card and shows the after-confirm message once confirmed", () => {
    render(<ChatApp />);
    const starter = screen.getByText(
      "Renew Acme University for 3 years and increase Cloud Pro to 250 seats."
    );
    fireEvent.click(starter);
    expect(screen.getByRole("alert")).toBeTruthy();
    const alert = screen.getByRole("alert");
    const confirmBtn = within(alert).getByText("Create renewal");
    fireEvent.click(confirmBtn);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText(
        "Renewal quote Q-10452 created for Acme University. 250 Cloud Pro seats at the preserved 12% discount, 36-month term."
      )
    ).toBeTruthy();
  });
});
