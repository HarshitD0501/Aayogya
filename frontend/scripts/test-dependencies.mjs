import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "..");

console.log("Checking frontend dependency security and patch levels...");

// 1. Verify npm audit --json returns 0 critical and 0 high vulnerabilities
try {
  const auditOutput = execSync("npm audit --json", { cwd: frontendDir, encoding: "utf8" });
  const audit = JSON.parse(auditOutput);
  const v = audit.metadata?.vulnerabilities || {};
  console.log(`npm audit: critical=${v.critical}, high=${v.high}, moderate=${v.moderate}, total=${v.total}`);
  if (v.critical > 0 || v.high > 0) {
    console.error("FAIL: Vulnerabilities detected in dependency graph:", v);
    process.exit(1);
  }
} catch (err) {
  // If npm audit returns non-zero, parse stdout if available
  if (err.stdout) {
    try {
      const audit = JSON.parse(err.stdout);
      const v = audit.metadata?.vulnerabilities || {};
      if (v.critical > 0 || v.high > 0) {
        console.error("FAIL: Unresolved critical/high vulnerabilities found:", v);
        process.exit(1);
      }
    } catch {
      console.error("FAIL: npm audit failed with parse error:", err.message);
      process.exit(1);
    }
  } else {
    console.error("FAIL: npm audit command error:", err.message);
    process.exit(1);
  }
}

// 2. Verify installed Next.js version
const nextPkg = JSON.parse(fs.readFileSync(path.join(frontendDir, "node_modules", "next", "package.json"), "utf8"));
console.log(`Installed Next.js version: ${nextPkg.version}`);
const [major, minor, patchVer] = nextPkg.version.split(".").map((n) => parseInt(n, 10));
if (major < 15 || (major === 15 && minor < 5) || (major === 15 && minor === 5 && patchVer < 28)) {
  console.error(`FAIL: Next.js version ${nextPkg.version} is below patched baseline 15.5.28`);
  process.exit(1);
}

// 3. Verify installed PostCSS override
const postcssPkg = JSON.parse(fs.readFileSync(path.join(frontendDir, "node_modules", "postcss", "package.json"), "utf8"));
console.log(`Installed root PostCSS version: ${postcssPkg.version}`);
const [pcMajor, pcMinor, pcPatch] = postcssPkg.version.split(".").map((n) => parseInt(n, 10));
if (pcMajor < 8 || (pcMajor === 8 && pcMinor === 5 && pcPatch < 23)) {
  console.error(`FAIL: PostCSS version ${postcssPkg.version} is vulnerable (<=8.5.22)`);
  process.exit(1);
}

// 4. Verify postcss-selector-parser
const pspPkg = JSON.parse(fs.readFileSync(path.join(frontendDir, "node_modules", "postcss-selector-parser", "package.json"), "utf8"));
console.log(`Installed postcss-selector-parser version: ${pspPkg.version}`);
const [pspMajor, pspMinor, pspPatch] = pspPkg.version.split(".").map((n) => parseInt(n, 10));
if (pspMajor < 7 || (pspMajor === 7 && pspMinor === 1 && pspPatch < 6)) {
  console.error(`FAIL: postcss-selector-parser version ${pspPkg.version} is vulnerable (<7.1.6)`);
  process.exit(1);
}

console.log("PASS: All frontend dependency security checks passed!");
