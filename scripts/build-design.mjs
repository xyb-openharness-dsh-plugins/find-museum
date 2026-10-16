import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url),
  read = (p) => readFile(new URL(p, root), "utf8");
let html = await read("design/prototype-v0.1.html");
for (const [href, file] of [
  ["vendor/leaflet.css", "design/vendor/leaflet.css"],
  ["prototype.css", "design/prototype.css"],
])
  html = html.replace(
    `<link rel="stylesheet" href="${href}">`,
    `<style>${await read(file)}</style>`,
  );
const sources = [
  await read("design/vendor/leaflet.js"),
  await read("design/catalog.js"),
  (await read("public/map.mjs")).replace(/^export /gm, ""),
  (await read("src/domain/route.mjs")).replace(/^export /gm, ""),
  (await read("design/prototype.js")).replace(/^import .*?;\n/gm, ""),
];
sources[2] = sources[2].replace(
  "endpoint='/api/find-museum/map'",
  "endpoint='http://127.0.0.1:4387/api/find-museum/map'",
);
const script = (s) =>
  "<script>" + s.replace(/<\/script/gi, "<\\/script") + "</script>";
html = html.replace(
  '<script src="vendor/leaflet.js"></script><script src="catalog.js"></script><script type="module" src="prototype.js"></script>',
  sources.map(script).join("\n"),
);
await writeFile(new URL("design/prototype-v0.1-standalone.html", root), html);
console.log(
  "Standalone prototype ready; maps require the local design server (port 4387) and network; no key is embedded.",
);
