import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url),
  file = (p) => new URL(p, root),
  pkg = JSON.parse(await readFile(file("package.json"), "utf8"));
const client = (await readFile(file("src/client.js"), "utf8")).replaceAll(
  "__VERSION__",
  pkg.version,
);
await mkdir(file("lib/"), { recursive: true });
await writeFile(file("lib/client.js"), client);
await copyFile(file("src/domain/route.mjs"), file("public/route.mjs"));
const source = await readFile(
  file("data/processed/museums-national.csv"),
  "utf8",
);
function csv(s) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (i === 0 && c === "\uFEFF") continue;
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error("CSV引号未闭合");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
const [headers, ...rows] = csv(source);
if (rows.some((r) => r.length !== headers.length))
  throw new Error("CSV列数不一致");
const catalog = rows.map((r) =>
  Object.fromEntries(headers.map((h, i) => [h, r[i]])),
);
if (
  catalog.length !== 5535 ||
  new Set(catalog.map((r) => r.museum_id)).size !== 5535
)
  throw new Error("名录记录不完整或重复");
await writeFile(
  file("data/processed/catalog.json"),
  JSON.stringify(catalog) + "\n",
);
console.log(
  JSON.stringify({
    version: pkg.version,
    client: "lib/client.js",
    catalog: catalog.length,
    dependenciesBundled: 0,
  }),
);
