import { shuffle, stripReasoning } from "@shared/scripts";

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = Object.freeze(["a", "b", "c", "d", "e"]);
    const result = shuffle(input);

    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["only"])).toEqual(["only"]);
  });

  it("is roughly uniform, unlike a random comparator", () => {
    const size = 5;
    const trials = 20000;
    const base = [...Array(size).keys()];
    const firstPositionCounts = new Array(size).fill(0);

    for (let i = 0; i < trials; i++) {
      firstPositionCounts[shuffle(base)[0]]++;
    }

    // Uniform share is 1/size; allow generous slack so this can't flake.
    const expected = trials / size;
    for (const count of firstPositionCounts) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });
});

describe("stripReasoning", () => {
  it("removes complete reasoning blocks", () => {
    expect(stripReasoning("<think>hidden</think>Hello there")).toBe(
      "Hello there"
    );
    expect(
      stripReasoning("<reasoning>a</reasoning>Answer<thinking>b</thinking>")
    ).toBe("Answer");
  });

  it("removes an unclosed opening tag and everything after it", () => {
    expect(stripReasoning("Partial answer<think>cut off mid thought")).toBe(
      "Partial answer"
    );
  });

  it("removes an orphan closing tag and everything before it", () => {
    expect(stripReasoning("leaked thought</think>Real answer")).toBe(
      "Real answer"
    );
  });

  it("leaves plain text untouched and trims", () => {
    expect(stripReasoning("  Just an answer  ")).toBe("Just an answer");
  });

  it("returns an empty string when there is no answer left", () => {
    expect(stripReasoning("<think>only reasoning")).toBe("");
  });
});
