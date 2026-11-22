import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "../lib/api-client";

describe("API and wallet error messages", () => {
  it("preserves provider errors returned as plain objects", () => {
    expect(getApiErrorMessage({ code: -32603, message: "Wallet signing failed" }, "Fallback"))
      .toBe("Wallet signing failed");
  });

  it("distinguishes a request with no server response", () => {
    expect(getApiErrorMessage({ isAxiosError: true, message: "Network Error" }, "Fallback"))
      .toBe("Cannot reach the server. Check your connection and try again.");
  });

  it("preserves the server explanation", () => {
    expect(getApiErrorMessage({ isAxiosError: true, response: { data: { error: "Invalid login payload" } } }, "Fallback"))
      .toBe("Invalid login payload");
  });
});
