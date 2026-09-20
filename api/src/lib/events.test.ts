import {
  exceedsEightyPercentRemaining,
} from "../lib/events";

describe("exceedsEightyPercentRemaining", () => {
  it("flags when amount > 80% of remaining daily budget", () => {
    // dailyLimit 5000, spent 0 → remaining 5000; 80% = 4000
    expect(exceedsEightyPercentRemaining(4001, 5000, 0)).toBe(true);
    expect(exceedsEightyPercentRemaining(4000, 5000, 0)).toBe(false);
    expect(exceedsEightyPercentRemaining(1500, 5000, 0)).toBe(false);
  });

  it("uses remaining after spentToday", () => {
    // remaining = 1000; 80% = 800
    expect(exceedsEightyPercentRemaining(801, 5000, 4000)).toBe(true);
    expect(exceedsEightyPercentRemaining(800, 5000, 4000)).toBe(false);
  });
});
