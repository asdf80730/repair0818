// scripts/sync-npm-lock.js — 由 bun.lock 生成 npm 格式 package-lock.json
// 用途：CI `npm ci` 讀 package-lock.json；bun install 寫 bun.lock。
// 此腳本橋接兩端：bun 寫 bun.lock → 此腳本同步寫 package-lock.json。
// bun.lock 採 JSON5（trailing comma），先 strip 再 JSON.parse。
import { readFileSync, writeFileSync } from "node:fs";

const json5 = (s) => JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bunLock = json5(readFileSync("bun.lock", "utf8"));

const root = bunLock.workspaces?.[""] ?? bunLock.workspaces[""];
const allRootDeps = { ...root?.dependencies, ...root?.devDependencies };

const bunPkgs = bunLock.packages || {};
const newPkgs = { "": lock.packages[""] };

for (const [name, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val)) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  const nmKey = "node_modules/" + name;
  const ent = {
    version: ver,
    resolved:
      resolved ||
      "https://registry.npmjs.org/" + nm + "/-/" + nm + "-" + ver + ".tgz",
    integrity: integrity || "",
    dev: !allRootDeps[nm],
  };
  if (info && info.dependencies) ent.dependencies = info.dependencies;
  if (info && info.peerDependencies)
    ent.peerDependencies = info.peerDependencies;
  if (info && info.optionalPeers && info.optionalPeers.length)
    ent.peerDependenciesMeta = Object.fromEntries(
      info.optionalPeers.map((p) => [p, { optional: true }]),
    );
  if (info && info.bin) ent.bin = info.bin;
  newPkgs[nmKey] = ent;
}
lock.packages = newPkgs;
writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
console.log(
  "package-lock.json synced:",
  Object.keys(newPkgs).length,
  "entries",
);
