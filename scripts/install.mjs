#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
let root = scriptDir;
try { await stat(path.join(root, "skills")); }
catch (error) {
  if (error?.code !== "ENOENT") throw error;
  root = path.resolve(scriptDir, "..");
}
const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const targetArg = value("--target");
if (!targetArg) {
  console.error("Usage: node scripts/install.mjs --target <skills-directory> [--skills a,b] [--force]");
  process.exit(2);
}
const source = path.join(root, "skills");
const available = (await readdir(source, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const requested = value("--skills")?.split(",").filter(Boolean) ?? available;
const unknown = requested.filter((name) => !available.includes(name));
if (unknown.length) throw new Error(`Unknown skill(s): ${unknown.join(", ")}`);
const target = path.resolve(targetArg);
await mkdir(target, { recursive: true });
for (const name of requested) {
  const origin = path.join(source, name);
  const destination = path.join(target, name);
  const relative = path.relative(origin, destination);
  const reverse = path.relative(destination, origin);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) || (!reverse.startsWith("..") && !path.isAbsolute(reverse))) {
    throw new Error(`Refusing overlapping source and destination for ${name}`);
  }
  const stageRoot = await mkdtemp(path.join(target, ".dumbass-install-"));
  const staged = path.join(stageRoot, name);
  let preserveStage = false;
  try {
    await cp(origin, staged, { recursive: true, errorOnExist: true });
    let exists = false;
    try { await stat(destination); exists = true; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (exists && !args.includes("--force")) throw new Error(`${destination} already exists; pass --force to replace it`);
    const backup = path.join(stageRoot, ".previous");
    if (exists) await rename(destination, backup);
    try { await rename(staged, destination); }
    catch (error) {
      if (exists) {
        try { await rename(backup, destination); }
        catch (restoreError) {
          preserveStage = true;
          throw new AggregateError([error, restoreError], `Install failed and the previous ${name} could not be restored; recovery data remains at ${stageRoot}`);
        }
      }
      throw error;
    }
    console.log(`installed ${name} -> ${destination}`);
  } finally {
    if (!preserveStage) await rm(stageRoot, { recursive: true, force: true });
  }
}
