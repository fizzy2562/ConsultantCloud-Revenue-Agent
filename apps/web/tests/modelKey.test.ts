import { afterEach, describe, expect, it } from "vitest";
import { clearModelKey, maskKey, modelKeyHeaders, readModelKey, saveModelKey } from "../lib/modelKey";

// Obviously fake, so secret scanners do not mistake it for a real key.
const FAKE = "test-" + "x".repeat(20);

afterEach(() => {
  window.sessionStorage.clear();
});

describe("bring your own key", () => {
  it("sends nothing until a key is saved", () => {
    expect(readModelKey()).toBeNull();
    expect(modelKeyHeaders()).toEqual({});
  });

  it("keeps the key in this tab's sessionStorage and sends it as headers", () => {
    saveModelKey(`  ${FAKE}  `, "deepseek/deepseek-v4-flash-0731");
    expect(modelKeyHeaders()).toEqual({ "x-llm-api-key": FAKE, "x-llm-model": "deepseek/deepseek-v4-flash-0731" });
    expect(window.sessionStorage.getItem("cc-llm-api-key")).toBe(FAKE);
  });

  it("leaves the model to the default when none is given, and forgets it all on remove", () => {
    saveModelKey(FAKE, " ");
    expect(modelKeyHeaders()).toEqual({ "x-llm-api-key": FAKE });
    clearModelKey();
    expect(readModelKey()).toBeNull();
  });

  it("masks the key for display", () => {
    expect(maskKey(FAKE)).toBe("test-x…xxxx");
  });
});
