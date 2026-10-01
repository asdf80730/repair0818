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

function buildRec(name, val) {
  if (!Array.isArray(val)) return null;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  const bare = nm.startsWith("@") ? nm.slice(nm.indexOf("/") + 1) : nm;
  const url =
    resolved ||
    "https://registry.npmjs.org/" + nm + "/-/" + bare + "-" + ver + ".tgz";
  return {
    version: ver,
    resolved: url,
    integrity: integrity || "",
    dev: !allRootDeps[nm],
    info,
  };
}

// 索引：頂層 name → rec；嵌套 "parent/child" → rec（也存為 name）
const byName = {};
for (const [k, v] of Object.entries(bunPkgs)) {
  const rec = buildRec(k, v);
  if (!rec) continue;
  byName[k] = rec;
  // 嵌套 key "parent/child"：也寫入 "child" 索引，讓 newEntries 能查到
  if (k.includes("/") && !byName[k.split("/").pop()])
    byName[k.split("/").pop()] = rec;
}

// 頂層 entries：依 npm ci 報的清單
const newEntries = [
  "jsdom",
  "cssstyle",
  "data-urls",
  "decimal.js",
  "form-data",
  "html-encoding-sniffer",
  "http-proxy-agent",
  "https-proxy-agent",
  "is-potential-custom-element-name",
  "nwsapi",
  "parse5",
  "rrweb-cssom",
  "saxes",
  "symbol-tree",
  "tough-cookie",
  "w3c-xmlserializer",
  "webidl-conversions",
  "whatwg-encoding",
  "whatwg-mimetype",
  "whatwg-url",
  "xml-name-validator",
  "@asamuzakjp/css-color",
  "@csstools/css-calc",
  "@csstools/css-tokenizer",
  "@csstools/css-parser-algorithms",
  "@csstools/css-color-parser",
  "lru-cache",
  "@csstools/color-helpers",
  "asynckit",
  "combined-stream",
  "es-set-tostringtag",
  "mime-types",
  "delayed-stream",
  "get-intrinsic",
  "has-tostringtag",
  "call-bind-apply-helpers",
  "es-define-property",
  "es-object-atoms",
  "get-proto",
  "gopd",
  "has-symbols",
  "math-intrinsics",
  "dunder-proto",
  "agent-base",
  "mime-db",
  "entities",
  "happy-dom",
  "xmlchars",
  "tldts",
  "tldts-core",
  "iconv-lite",
  "safer-buffer",
  "tr46",
  "punycode",
  "undici",
  "ws",
  "youch",
  "cookie",
];
let added = 0;
for (const name of newEntries) {
  const rec = byName[name];
  if (!rec) continue;
  const key = "node_modules/" + name;
  if (lock.packages[key]) continue;
  const ent = {
    version: rec.version,
    resolved: rec.resolved,
    integrity: rec.integrity,
    dev: rec.dev,
  };
  if (rec.info?.dependencies) ent.dependencies = rec.info.dependencies;
  if (rec.info?.peerDependencies)
    ent.peerDependencies = rec.info.peerDependencies;
  if (rec.info?.optionalPeers?.length)
    ent.peerDependenciesMeta = Object.fromEntries(
      rec.info.optionalPeers.map((p) => [p, { optional: true }]),
    );
  if (rec.info?.bin) ent.bin = rec.info.bin;
  lock.packages[key] = ent;
  added++;
}

// 嵌套 entries：依 bun.lock "parent/child" key
const nested = [["cssstyle", "rrweb-cssom", "0.8.0"]];
for (const [parent, child, ver] of nested) {
  const rec = byName[parent + "/" + child];
  if (!rec) continue;
  const key = `node_modules/${parent}/node_modules/${child}`;
  if (lock.packages[key]) continue;
  lock.packages[key] = {
    version: ver,
    resolved: rec.resolved,
    integrity: rec.integrity,
    dev: rec.dev,
  };
  added++;
}

writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
console.log(
  "package-lock.json synced: +" +
    added +
    " entries; total=" +
    Object.keys(lock.packages).length,
);
