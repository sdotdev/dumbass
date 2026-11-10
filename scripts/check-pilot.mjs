#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/check-pilot.mjs <pilot-approval.json>");
const record = JSON.parse(await readFile(path.resolve(input), "utf8"));
if (record.status !== "approved") throw new Error("Pilot status must be approved");
if (typeof record.reviewer !== "string" || record.reviewer.length < 2 || record.reviewer.includes("replace-with")) throw new Error("A human reviewer is required");
if (!/^\d{4}-\d{2}-\d{2}T/.test(record.reviewed_at ?? "")) throw new Error("reviewed_at must be an ISO timestamp");
if (!/^[a-f0-9]{40}$/.test(record.commit ?? "")) throw new Error("Pilot must identify a full Git commit SHA");
if (!Array.isArray(record.scope) || record.scope.length === 0) throw new Error("Pilot scope is required");
const { stdout: headOutput } = await exec("git", ["rev-parse", "HEAD"]);
const head = headOutput.trim();
if (record.commit !== head) throw new Error(`Pilot approval is for ${record.commit}, but current HEAD is ${head}`);
const { stdout: status } = await exec("git", ["status", "--porcelain"]);
if (status.trim()) throw new Error("Release checkout must be clean after the approved pilot");
console.log(`approved human pilot by ${record.reviewer} for ${record.commit}`);
