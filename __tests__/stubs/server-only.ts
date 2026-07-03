// Test stub for the `server-only` guard package. In a real build the package throws when imported
// into a Client Component; under vitest (jsdom env) that guard would wrongly fire when unit-testing
// a server module, so we alias `server-only` to this no-op (see vitest.config.ts).
export {};
