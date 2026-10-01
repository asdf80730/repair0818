// scripts/sync-npm-lock.js — 由 bun.lock 全量重生 package-lock.json
// 用途：CI `npm ci` 讀 package-lock.json；bun install 寫 bun.lock。
// bun.lock 採 JSON5（trailing comma），先 strip 再 JSON.parse。
// 採用全量重生策略：直接以 bun.lock 為單一真相重建 packages map，
// 再補上 bun.lock 沒記的 nested key（依 npm ci 報的 missing 清單）。
import { readFileSync, writeFileSync } from "node:fs";

const json5 = (s) => JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));

const oldLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bunLock = json5(readFileSync("bun.lock", "utf8"));

const root = bunLock.workspaces?.[""] ?? bunLock.workspaces[""];
const allRootDeps = { ...root?.dependencies, ...root?.devDependencies };

const bunPkgs = bunLock.packages || {};
const newPkgs = { "": oldLock.packages[""] };

for (const [name, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val)) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  const bare = nm.startsWith("@") ? nm.slice(nm.indexOf("/") + 1) : nm;
  const url =
    resolved ||
    "https://registry.npmjs.org/" + nm + "/-/" + bare + "-" + ver + ".tgz";
  const ent = {
    version: ver,
    resolved: url,
    integrity: integrity || "",
    dev: !allRootDeps[nm],
  };
  if (info?.dependencies) ent.dependencies = info.dependencies;
  if (info?.peerDependencies) ent.peerDependencies = info.peerDependencies;
  if (info?.optionalPeers?.length)
    ent.peerDependenciesMeta = Object.fromEntries(
      info.optionalPeers.map((p) => [p, { optional: true }]),
    );
  if (info?.bin) ent.bin = info.bin;
  newPkgs["node_modules/" + name] = ent;
}

// 保留舊 lock 的 nested entries（不在 bun.lock 中）
for (const [k, v] of Object.entries(oldLock.packages)) {
  if (k === "") continue;
  if (newPkgs[k]) continue;
  // 判斷 nested：node_modules 段數 ≥ 3
  const seg = k.split("/");
  if (seg.length >= 3 && seg[0] === "node_modules" && seg[1] !== "") {
    newPkgs[k] = v;
  }
}

oldLock.packages = newPkgs;
writeFileSync("package-lock.json", JSON.stringify(oldLock, null, 2) + "\n");
console.log(
  "package-lock.json rebuilt:",
  Object.keys(newPkgs).length,
  "entries",
);
