import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

describe("npm pack contents and npx execution from a clean directory", () => {
  let packDir: string;
  let tarballPath: string;
  let cleanDir: string;

  beforeAll(() => {
    packDir = mkdtempSync(path.join(tmpdir(), "dbconnect-mcp-pack-"));
    const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: REPO_ROOT,
    }).toString();
    const [packInfo] = JSON.parse(packOutput) as { filename: string; files: { path: string }[] }[];
    tarballPath = path.join(packDir, packInfo!.filename);

    cleanDir = mkdtempSync(path.join(tmpdir(), "dbconnect-mcp-npx-clean-"));
    cpSync(tarballPath, path.join(cleanDir, path.basename(tarballPath)));
  }, 60_000);

  afterAll(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(cleanDir, { recursive: true, force: true });
  });

  it("includes only dist, package.json, README.md, and LICENSE", () => {
    const listing = execFileSync("tar", ["-tzf", tarballPath]).toString();
    const entries = listing
      .split("\n")
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//, ""));

    for (const entry of entries) {
      const topLevel = entry.split("/")[0];
      expect(["dist", "package.json", "README.md", "LICENSE"]).toContain(topLevel);
    }
    expect(entries).toContain("package.json");
    expect(entries).toContain("README.md");
    expect(entries).toContain("LICENSE");
    expect(entries.some((e) => e.startsWith("dist/cli.js"))).toBe(true);
    expect(entries.some((e) => e.includes("test/"))).toBe(false);
    expect(entries.some((e) => e.includes("src/"))).toBe(false);
  });

  it("runs --help successfully via npx from a clean temp directory", () => {
    const basename = readdirSync(cleanDir)[0];
    const output = execFileSync("npx", ["--yes", `./${basename}`, "--help"], {
      cwd: cleanDir,
      encoding: "utf8",
    });
    expect(output).toContain("dbconnect-mcp");
    expect(output).toContain("--host");
    expect(output).toContain("Environment variables");
  });

  it("runs --version successfully via npx from a clean temp directory", () => {
    const basename = readdirSync(cleanDir)[0];
    const output = execFileSync("npx", ["--yes", `./${basename}`, "--version"], {
      cwd: cleanDir,
      encoding: "utf8",
    });
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
