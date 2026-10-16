import { readFile, writeFile } from "node:fs/promises";
import { roadbookHtml } from "../src/domain/roadbook.mjs";
const snapshot = JSON.parse(
  await readFile(
    new URL("../design/samples/suzhou-roadbook.json", import.meta.url),
    "utf8",
  ),
);
const svg = await readFile(
  new URL("../assets/song/lotus-bowl.svg", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../design/roadbook-guofeng-v0.1.html", import.meta.url),
  roadbookHtml(snapshot, { motifSvg: svg }),
);
console.log(
  "Rendered design/roadbook-guofeng-v0.1.html from saved public sample; does not claim fresh network checks.",
);
