// scripts/sync-npm-lock.js — 由 bun.lock 同步 package-lock.json
// 1. 保留原 npm lock 的全部 entries
// 2. 從 bun.lock 抽 missing 的 entries，依 npm 格式追加
// 3. 同 key 多版本 → 嵌套寫入 parent 的 node_modules 子層
import { readFileSync, writeFileSync } from "node:fs";

const json5 = (s) => JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const bunLock = json5(readFileSync("bun.lock", "utf8"));

const root = bunLock.workspaces?.[""] ?? bunLock.workspaces[""];
const allRootDeps = { ...root?.dependencies, ...root?.devDependencies };

const bunPkgs = bunLock.packages || {};

// 收集所有 "name" → { version, resolved, info, integrity }
const byName = {};
for (const [name, val] of Object.entries(bunPkgs)) {
  if (!Array.isArray(val)) continue;
  const [tag, resolved, info, integrity] = val;
  const at = tag.lastIndexOf("@");
  const nm = tag.slice(0, at);
  const ver = tag.slice(at + 1);
  const rec = {
    version: ver,
    resolved:
      resolved ||
      "https://registry.npmjs.org/" + nm + "/-/" + nm + "-" + ver + ".tgz",
    integrity: integrity || "",
    dev: !allRootDeps[nm],
    info,
  };
  byName[name] = rec;
}

// 補 missing：以 npm ci 報的清單為準
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

// 頂層 entries
let added = 0;
for (const name of newEntries) {
  const rec = byName[name];
  if (!rec) continue;
  const key = "node_modules/" + name;
  if (lock.packages[key]) continue; // 已有就跳過
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
// 嵌套 entries：bun.lock 用 "parent/child" key，npm lock 用 node_modules/parent/node_modules/child
const nested = [["@csstools/css-color-parser", "rrweb-cssom", "0.8.0"]];
for (const [parent, child, ver] of nested) {
  const bunKey = parent + "/" + child;
  const rec = byName[bunKey];
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
