// scripts/sync-npm-lock.js — 由 bun.lock 重生 package-lock.json
// 用途：CI `npm ci` 讀 package-lock.json；bun install 寫 bun.lock。
// bun.lock 採 JSON5（trailing comma），先 strip 再 JSON.parse。
// 策略：保留舊 lock 的 packages，再用 bun.lock 全量補足 nested key。
import { readFileSync, writeFileSync } from "node:fs";

const json5 = (s) => JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));

const oldLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bunLock = json5(readFileSync("bun.lock", "utf8"));

const root = bunLock.workspaces?.[""] ?? bunLock.workspaces[""];
const allRootDeps = { ...root?.dependencies, ...root?.devDependencies };

const bunPkgs = bunLock.packages || {};
const merged = { ...oldLock.packages };

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

for (const [bunKey, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val)) continue;
  const npmKey = bunToNpmKey(bunKey);
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  merged[npmKey] = toEntry(
    nm,
    ver,
    resolved,
    info,
    integrity,
    !allRootDeps[nm],
  );
}

function bunToNpmKey(bunKey) {
  if (!bunKey.includes("/")) return "node_modules/" + bunKey;
  // "@scope/pkg" 是單一段；嵌套用 / 分隔
  const merged = [];
  let i = 0;
  while (i < bunKey.length) {
    const slash = bunKey.indexOf("/", i);
    if (slash === -1) {
      merged.push(bunKey.slice(i));
      break;
    }
    const seg = bunKey.slice(i, slash);
    if (seg.startsWith("@")) {
      const slash2 = bunKey.indexOf("/", slash + 1);
      if (slash2 === -1) {
        merged.push(seg + "/" + bunKey.slice(slash + 1));
        break;
      }
      merged.push(seg + "/" + bunKey.slice(slash + 1, slash2));
      i = slash2 + 1;
    } else {
      merged.push(seg);
      i = slash + 1;
    }
  }
  return "node_modules/" + merged.join("/node_modules/");
}

oldLock.packages = merged;
writeFileSync("package-lock.json", JSON.stringify(oldLock, null, 2) + "\n");
console.log(
  "package-lock.json rebuilt:",
  Object.keys(merged).length,
  "entries",
);
