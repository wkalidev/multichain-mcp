// Builds a self-contained .mcpb bundle (MCP Bundle format) for one-click local
// install (e.g. Smithery's "Local MCPB Bundle" publishing path). Unlike the npm
// package, this bundles compiled output + production node_modules directly, so
// it runs offline without npx/network access at install time.
//
// Usage: npm run build:mcpb
// Output: .mcpb-build/multichain-mcp-<version>.mcpb (gitignored)

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const buildDir = path.join(root, ".mcpb-build");
const stagingDir = path.join(buildDir, "staging");
const serverDir = path.join(stagingDir, "server");

console.log(`Building .mcpb bundle for ${pkg.name}@${pkg.version}`);

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

console.log("1/4 Compiling TypeScript...");
execSync("npm run build", { cwd: root, stdio: "inherit" });
cpSync(path.join(root, "dist"), serverDir, { recursive: true });

console.log("2/4 Installing production dependencies into the bundle...");
writeFileSync(
  path.join(serverDir, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: pkg.type,
      private: true,
      dependencies: pkg.dependencies,
      overrides: pkg.overrides,
    },
    null,
    2
  )
);
execSync("npm install --omit=dev", { cwd: serverDir, stdio: "inherit" });

console.log("3/4 Copying manifest.json (keep its version in sync with package.json)...");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  console.warn(
    `  WARNING: manifest.json version (${manifest.version}) does not match package.json (${pkg.version}). Update manifest.json before publishing.`
  );
}
cpSync(path.join(root, "manifest.json"), path.join(stagingDir, "manifest.json"));

console.log("4/4 Packing...");
const outFile = path.join(buildDir, `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.mcpb`);
if (existsSync(outFile)) rmSync(outFile);
execSync(`npx mcpb pack "${stagingDir}" "${outFile}"`, { cwd: root, stdio: "inherit" });

console.log(`\nDone: ${outFile}`);
console.log("Upload this file to Smithery's dashboard (Local MCPB Bundle publishing).");
