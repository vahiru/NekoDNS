import { describe, expect, it } from "vitest";
import { normalizeRecordName, validateRecordContent } from "../src/shared/dns";

describe("DNS policy", () => {
  it("normalizes child names without duplicating parent domains", () => {
    expect(normalizeRecordName("demo", "is-cute.cat")).toBe("demo.is-cute.cat");
    expect(normalizeRecordName("demo.is-cute.cat", "is-cute.cat")).toBe("demo.is-cute.cat");
  });

  it("rejects apex, wildcard, and reserved labels", () => {
    expect(() => normalizeRecordName("@", "is-cute.cat")).toThrow();
    expect(() => normalizeRecordName("*.demo", "is-cute.cat")).toThrow();
    expect(() => normalizeRecordName("admin", "is-cute.cat")).toThrow();
  });

  it("validates supported record content", () => {
    expect(() => validateRecordContent("A", "192.0.2.10")).not.toThrow();
    expect(() => validateRecordContent("CNAME", "target.example.com")).not.toThrow();
    expect(() => validateRecordContent("A", "999.1.1.1")).toThrow();
  });
});
