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

// 頂層：key = 套件名
for (const [name, val] of Object.entries(bunPkgs)) {
  if (
    !Array.isArray(val) ||
    name.includes("/") ||
    !name.startsWith("@") === false
  ) {
    // 頂層與 nested 都用同一個 name；nested 的 key 含 "/"，下面處理
  }
  if (!Array.isArray(val)) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  const key = name.includes("/")
    ? bunToNpmNestedKey(name, nm)
    : "node_modules/" + name;
  if (key)
    newPkgs[key] = toEntry(
      nm,
      ver,
      resolved,
      info,
      integrity,
      !allRootDeps[nm],
    );
}

// 將 bun 的 nested key 轉 npm 格式
function bunToNpmNestedKey(bunKey, nm) {
  const segs = bunKey.split("/");
  // 還原為「完整」段：@scope/pkg 在 bun 用 @scope/pkg 寫，但 split 後是 ["@scope","pkg"]
  // 需把 @scope 接回 pkg 前綴
  const merged = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].startsWith("@") && i + 1 < segs.length) {
      merged.push(segs[i] + "/" + segs[i + 1]);
      i++;
    } else {
      merged.push(segs[i]);
    }
  }
  // 用 nm 取代最後一段，因 nm 已含 scope（@x/y）；merged 的最後段是 nm 的 bare
  if (nm.startsWith("@")) {
    const bare = nm.slice(nm.indexOf("/") + 1);
    if (merged.length >= 1 && merged[merged.length - 1] === bare) {
      // 已經對上
    }
  }
  return "node_modules/" + merged.join("/node_modules/");
}

oldLock.packages = newPkgs;
writeFileSync("package-lock.json", JSON.stringify(oldLock, null, 2) + "\n");
console.log(
  "package-lock.json rebuilt:",
  Object.keys(newPkgs).length,
  "entries",
);
