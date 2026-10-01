// scripts/sync-npm-lock.js — 由 bun.lock 全量重生 package-lock.json
// 用途：CI `npm ci` 讀 package-lock.json；bun install 寫 bun.lock。
// bun.lock 採 JSON5（trailing comma），先 strip 再 JSON.parse。
// 全量重生策略：以 bun.lock 為單一真相重建 packages map（含 nested key）。
import { readFileSync, writeFileSync } from "node:fs";

const json5 = (s) => JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));

const oldLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bunLock = json5(readFileSync("bun.lock", "utf8"));

const root = bunLock.workspaces?.[""] ?? bunLock.workspaces[""];
const allRootDeps = { ...root?.dependencies, ...root?.devDependencies };

const bunPkgs = bunLock.packages || {};
const newPkgs = { "": oldLock.packages[""] };

function toEntry(nm, ver, resolved, info, integrity, isDev) {
  const bare = nm.startsWith("@") ? nm.slice(nm.indexOf("/") + 1) : nm;
  const url =
    resolved ||
    "https://registry.npmjs.org/" + nm + "/-/" + bare + "-" + ver + ".tgz";
  const ent = {
    version: ver,
    resolved: url,
    integrity: integrity || "",
    dev: isDev,
  };
  if (info?.dependencies) ent.dependencies = info.dependencies;
  if (info?.peerDependencies) ent.peerDependencies = info.peerDependencies;
  if (info?.optionalDependencies)
    ent.optionalDependencies = info.optionalDependencies;
  if (info?.optionalPeers?.length)
    ent.peerDependenciesMeta = Object.fromEntries(
      info.optionalPeers.map((p) => [p, { optional: true }]),
    );
  if (info?.bin) ent.bin = info.bin;
  return ent;
}

// 1. 頂層：key = 套件名
for (const [name, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val)) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  newPkgs["node_modules/" + name] = toEntry(
    nm,
    ver,
    resolved,
    info,
    integrity,
    !allRootDeps[nm],
  );
}

// 2. 嵌套：key = "parent/child" → node_modules/parent/node_modules/child
for (const [name, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val) || !name.includes("/")) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  // 依 bun key 推 npm nested key：
  //   "a/b" → node_modules/a/node_modules/b
  //   "a/b/c" → node_modules/a/node_modules/b/node_modules/c
  const segs = name.split("/");
  const last = segs.pop(); // child 名
  const parentPath = "node_modules/" + segs.join("/node_modules/");
  const npmKey = parentPath + "/node_modules/" + last;
  newPkgs[npmKey] = toEntry(
    nm,
    ver,
    resolved,
    info,
    integrity,
    !allRootDeps[nm],
  );
}

oldLock.packages = newPkgs;
writeFileSync("package-lock.json", JSON.stringify(oldLock, null, 2) + "\n");
console.log(
  "package-lock.json rebuilt:",
  Object.keys(newPkgs).length,
  "entries",
);
