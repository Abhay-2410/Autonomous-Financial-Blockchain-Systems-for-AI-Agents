import {
  DEMO_USD_EQUIV_TO_XLM,
  formatXlmForStellar,
  policyUnitsToXlm,
} from "./money";

describe("money units", () => {
  it("uses a labeled 1:1 demo rate (1 USD-equivalent = 1 XLM)", () => {
    expect(DEMO_USD_EQUIV_TO_XLM).toBe(1);
    expect(policyUnitsToXlm(25)).toBe(25);
    expect(formatXlmForStellar(25)).toBe("25.0000000");
  });

  it("does not introduce a 1000× (or any) silent scale factor", () => {
    expect(policyUnitsToXlm(25)).not.toBe(25_000);
    expect(policyUnitsToXlm(25)).not.toBe(25 * 10_000_000);
  });
});
