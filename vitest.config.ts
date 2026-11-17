import { defineConfig } from "vitest/config";

// The tests never touch the network: every TinyFish answer they use is a made-up fixture.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
