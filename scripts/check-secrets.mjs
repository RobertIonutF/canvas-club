import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const rules = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /(?:prod|dev):[a-z0-9-]+\|[A-Za-z0-9+/=._-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{24,}/,
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
];
const failures = [];
for (const file of files) {
  if (
    /(^|\/)\.env(?!\.example$)(?:\.|$)/.test(file) ||
    file.startsWith(".frontend-craft/") ||
    file.startsWith(".vercel/") ||
    file.startsWith(".playwright-cli/")
  ) {
    failures.push(file);
    continue;
  }
  const content = execFileSync("git", ["show", `:${file}`], {
    maxBuffer: 20 * 1024 * 1024,
  }).toString("utf8");
  if (rules.some((rule) => rule.test(content))) failures.push(file);
}
if (failures.length) {
  console.error(
    `Secret/release-boundary check failed in ${failures.length} file(s):\n${failures.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Checked ${files.length} tracked files: no credential matches or private evidence files.`,
);
