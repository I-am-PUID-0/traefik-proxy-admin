import { describe, expect, it } from "vitest";
import { formatMiddlewareNames, parseMiddlewareNames } from "@/lib/middleware-utils";

describe("middleware name normalization", () => {
  it("parses comma-separated middleware text", () => {
    expect(parseMiddlewareNames("chain-oauth@file, compress@file")).toEqual([
      "chain-oauth@file",
      "compress@file",
    ]);
  });

  it("parses JSON arrays stored by the API", () => {
    expect(parseMiddlewareNames(JSON.stringify(["chain-oauth@file", "compress@file"]))).toEqual([
      "chain-oauth@file",
      "compress@file",
    ]);
  });

  it("recovers old JSON-stringified middleware names without keeping quotes", () => {
    const oldStoredValue = JSON.stringify("chain-oauth@file");

    expect(parseMiddlewareNames(oldStoredValue)).toEqual(["chain-oauth@file"]);
    expect(formatMiddlewareNames(oldStoredValue)).toBe("chain-oauth@file");
  });
});
