declare global {
  const test: typeof import("bun:test")["test"];
  const describe: typeof import("bun:test")["describe"];
  const expect: typeof import("bun:test")["expect"];
}
export {};