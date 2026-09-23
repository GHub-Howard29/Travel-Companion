import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const docsRoot = path.join(projectRoot, "docs");
const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

function collectMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(absolutePath);
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith(".md")
      ? [absolutePath]
      : [];
  });
}

function splitTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const wrappedTarget = trimmed.match(/^<([^>]+)>(?:\s+["'][^"']*["'])?$/);
  if (wrappedTarget) {
    return wrappedTarget[1];
  }

  const targetWithoutTitle = trimmed.match(/^(\S+)(?:\s+["'][^"']*["'])?$/);
  return targetWithoutTitle?.[1] ?? trimmed;
}

function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?、。，：；！？「」『』（）]/g, "")
    .replace(/\s+/g, "-");
}

function collectHeadingSlugs(markdown) {
  const counts = new Map();
  const slugs = new Set();

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const baseSlug = githubSlug(match[1]);
    const duplicateCount = counts.get(baseSlug) ?? 0;
    counts.set(baseSlug, duplicateCount + 1);
    slugs.add(duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`);
  }

  return slugs;
}

const markdownFiles = [
  ...collectMarkdownFiles(docsRoot),
  path.join(projectRoot, "agent.md"),
  path.join(projectRoot, "AGENTS.md"),
  path.join(projectRoot, "README.md"),
].filter((filePath) => fs.existsSync(filePath));

const failures = [];
let checkedTargets = 0;

for (const sourcePath of markdownFiles) {
  const markdown = fs.readFileSync(sourcePath, "utf8");

  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const target = splitTarget(match[1]);
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }

    checkedTargets += 1;
    const hashIndex = target.indexOf("#");
    const rawPath = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const rawFragment = hashIndex >= 0 ? target.slice(hashIndex + 1) : "";
    const decodedPath = decodeTarget(rawPath);
    const decodedFragment = decodeTarget(rawFragment);
    const resolvedPath = path.resolve(path.dirname(sourcePath), decodedPath);
    const lineNumber = markdown.slice(0, match.index).split(/\r?\n/).length;

    if (!fs.existsSync(resolvedPath)) {
      failures.push(
        `${path.relative(projectRoot, sourcePath)}:${lineNumber} -> 目標不存在：${target}`,
      );
      continue;
    }

    if (decodedFragment && fs.statSync(resolvedPath).isFile()) {
      const targetMarkdown = fs.readFileSync(resolvedPath, "utf8");
      const headingSlugs = collectHeadingSlugs(targetMarkdown);
      if (!headingSlugs.has(decodedFragment.toLowerCase())) {
        failures.push(
          `${path.relative(projectRoot, sourcePath)}:${lineNumber} -> 錨點不存在：${target}`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("文件連結驗證失敗：");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `文件連結驗證通過：${markdownFiles.length} 份 Markdown，${checkedTargets} 個本地目標。`,
);
