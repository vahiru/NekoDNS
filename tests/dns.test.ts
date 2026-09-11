import { describe, expect, it } from "vitest";
import { normalizeRecordName, validateRecordContent } from "../src/shared/dns";

const PARENT = "is-cute.cat";

describe("DNS policy", () => {
  it("normalizes child names without duplicating parent domains", () => {
    expect(normalizeRecordName("demo", PARENT)).toBe("demo.is-cute.cat");
    expect(normalizeRecordName("demo.is-cute.cat", PARENT)).toBe("demo.is-cute.cat");
    expect(normalizeRecordName("  DEMO.Is-Cute.Cat.  ", PARENT)).toBe("demo.is-cute.cat");
  });

  it("rejects apex, wildcard, and reserved labels", () => {
    expect(() => normalizeRecordName("@", PARENT)).toThrow();
    expect(() => normalizeRecordName("*.demo", PARENT)).toThrow();
    expect(() => normalizeRecordName("admin", PARENT)).toThrow();
  });

  it("reserves the whole subtree of a reserved label, not just the bare name", () => {
    expect(() => normalizeRecordName("www.admin", PARENT)).toThrow(/admin/);
    expect(() => normalizeRecordName("a.b.mail", PARENT)).toThrow(/mail/);
  });

  it("keeps apex control records out of reach while allowing them per subdomain", () => {
    // _acme-challenge.is-cute.cat would issue certificates for the apex domain.
    expect(() => normalizeRecordName("_acme-challenge", PARENT)).toThrow();
    expect(() => normalizeRecordName("_dmarc", PARENT)).toThrow();
    // Under a subdomain it only proves control of that subdomain, so it stays allowed.
    expect(normalizeRecordName("_acme-challenge.myapp", PARENT)).toBe("_acme-challenge.myapp.is-cute.cat");
  });

  it("rejects malformed labels and excessive depth", () => {
    expect(() => normalizeRecordName("a..b", PARENT)).toThrow();
    expect(() => normalizeRecordName("-lead", PARENT)).toThrow();
    expect(() => normalizeRecordName("a.b.c.d.e.f.g", PARENT)).toThrow();
  });

  it("validates supported record content", () => {
    expect(() => validateRecordContent("A", "192.0.2.10")).not.toThrow();
    expect(() => validateRecordContent("AAAA", "2001:db8::10")).not.toThrow();
    expect(() => validateRecordContent("CNAME", "target.example.com")).not.toThrow();
    expect(() => validateRecordContent("TXT", "v=spf1 -all")).not.toThrow();
    expect(() => validateRecordContent("A", "999.1.1.1")).toThrow();
    expect(() => validateRecordContent("AAAA", "2001:db8:::10")).toThrow();
    expect(() => validateRecordContent("CNAME", "192.0.2.10")).toThrow();
    expect(() => validateRecordContent("CNAME", "nodots")).toThrow();
    expect(() => validateRecordContent("A", "   ")).toThrow();
  });
});
