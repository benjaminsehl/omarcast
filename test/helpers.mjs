import { readFileSync } from "node:fs";
import vm from "node:vm";

// Load a QML `.pragma library` JS file into a plain node context.
export function loadQmlJs(path) {
  const src = readFileSync(new URL(path, import.meta.url), "utf8").replace(/^\.pragma library\s*$/m, "");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
