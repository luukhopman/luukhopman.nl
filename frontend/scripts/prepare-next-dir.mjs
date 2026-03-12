import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const projectNextDir = path.join(frontendDir, ".next");
const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const cacheProjectDir = path.join(cacheRoot, "website-frontend", "frontend");
const targetNextDir = path.join(cacheProjectDir, ".next");
const cacheNodeModulesLink = path.join(cacheProjectDir, "node_modules");
const projectNodeModulesDir = path.join(frontendDir, "node_modules");
const reset = process.argv.includes("--reset");

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function ensureTargetDir() {
  if (reset) {
    await fs.rm(targetNextDir, { recursive: true, force: true });
  }

  await fs.mkdir(cacheProjectDir, { recursive: true });
  await fs.mkdir(targetNextDir, { recursive: true });
}

async function ensureNodeModulesLink() {
  const relativeTarget = path.relative(cacheProjectDir, projectNodeModulesDir) || ".";

  if (await pathExists(cacheNodeModulesLink)) {
    const currentStat = await fs.lstat(cacheNodeModulesLink);
    if (currentStat.isSymbolicLink()) {
      const currentTarget = await fs.readlink(cacheNodeModulesLink);
      const resolvedTarget = path.resolve(cacheProjectDir, currentTarget);
      if (resolvedTarget === projectNodeModulesDir) {
        return;
      }
    }

    await fs.rm(cacheNodeModulesLink, { recursive: true, force: true });
  }

  await fs.symlink(relativeTarget, cacheNodeModulesLink, "dir");
}

async function ensureProjectLink() {
  const relativeTarget = path.relative(frontendDir, targetNextDir) || ".";

  if (await pathExists(projectNextDir)) {
    const currentStat = await fs.lstat(projectNextDir);
    if (currentStat.isSymbolicLink()) {
      const currentTarget = await fs.readlink(projectNextDir);
      const resolvedTarget = path.resolve(frontendDir, currentTarget);
      if (resolvedTarget === targetNextDir) {
        return;
      }
    }

    // `.next` is generated output, so replacing it is safe here.
    await fs.rm(projectNextDir, { recursive: true, force: true });
  }

  await fs.symlink(relativeTarget, projectNextDir, "dir");
}

await ensureTargetDir();
await ensureNodeModulesLink();
await ensureProjectLink();
