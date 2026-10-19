import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function getPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(here, "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}
