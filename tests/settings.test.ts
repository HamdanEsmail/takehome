import { describe, expect, it } from "vitest";
import { parseSettings } from "../src/settings.ts";

describe("the settings file", () => {
  it("reads KEY=value lines, with or without quotes, and skips comments and blanks", () => {
    expect(parseSettings('# my settings\nTAKEHOME_ORIGIN=https://school.example\n\nTAKEHOME_PROFILE="Blackboard"\n  TAKEHOME_CAP_USD = 8 \nnot a setting\n')).toEqual({
      TAKEHOME_ORIGIN: "https://school.example",
      TAKEHOME_PROFILE: "Blackboard",
      TAKEHOME_CAP_USD: "8",
    });
  });

  it("keeps an equals sign inside a value", () => {
    expect(parseSettings("TAKEHOME_SALT=ab=cd==")).toEqual({ TAKEHOME_SALT: "ab=cd==" });
  });
});
