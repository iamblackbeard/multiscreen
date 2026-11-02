import { describe, expect, it } from "vitest";

import { requiredApiBaseUrl } from "./environment.ts";
import { testApiBaseUrl } from "./test-environment.ts";

describe("extension environment", () => {
  it("reads and normalizes an API origin", () => {
    expect(requiredApiBaseUrl(`${testApiBaseUrl}/`)).toBe(testApiBaseUrl);
  });

  it("requires the API base URL", () => {
    expect(() => requiredApiBaseUrl(undefined)).toThrow(
      "VITE_API_BASE_URL is required",
    );
  });

  it.each([
    "not-a-url",
    testApiBaseUrl.replace("https:", "ftp:"),
    `${testApiBaseUrl}/v1`,
    testApiBaseUrl.replace("https://", "https://user:secret@"),
  ])("rejects an invalid API origin: %s", (value) => {
    expect(() => requiredApiBaseUrl(value)).toThrow();
  });
});
