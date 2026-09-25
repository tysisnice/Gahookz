// Documentation check: every relative Markdown link resolves, and the wiki
// index and the wiki pages agree with each other.
//
//   npm run docs:check
//
// Documents are only useful to the next agent if they can be followed, so a
// broken link is treated like a failing test. External links are not fetched.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((file) => !file.startsWith("docs/verification/") && fs.existsSync(path.join(root, file)));

const problems = [];
const linkPattern = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

for (const file of tracked) {
  const source = fs.readFileSync(path.join(root, file), "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target) || target.includes("<")) continue;
    const withoutAnchor = decodeURIComponent(target.split("#")[0]);
    if (!withoutAnchor) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), withoutAnchor);
    if (!fs.existsSync(resolved)) problems.push(`${file}: broken link → ${target}`);
  }
}

const wikiDir = path.join(root, "docs/wiki");
if (fs.existsSync(wikiDir)) {
  const pages = fs.readdirSync(wikiDir).filter((name) => name.endsWith(".md") && !["README.md", "_template.md"].includes(name));
  const index = fs.readFileSync(path.join(wikiDir, "README.md"), "utf8");
  for (const page of pages) {
    if (!index.includes(`(${page})`)) problems.push(`docs/wiki/${page}: not listed in docs/wiki/README.md`);
    const body = fs.readFileSync(path.join(wikiDir, page), "utf8");
    for (const heading of ["## Where it lives", "## History"]) {
      if (!body.includes(heading)) problems.push(`docs/wiki/${page}: missing "${heading}" section`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} documentation problem(s).`);
  process.exit(1);
}
console.log(`Documentation check passed: ${tracked.length} Markdown files.`);
