import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const directories = ["src", "public", "dsh", "lib"];
let count = 0;
for (const dir of directories) {
  const walk = async (p) => {
    for (const f of await readdir(p, { withFileTypes: true })) {
      const file = p + "/" + f.name;
      if (f.isDirectory()) {
        if (f.name !== "vendor") await walk(file);
      } else if (/\.(mjs|js)$/.test(file)) {
        const r = spawnSync(process.execPath, ["--check", file], {
          encoding: "utf8",
        });
        if (r.status !== 0) throw new Error(r.stderr);
        count++;
      }
    }
  };
  await walk(dir);
}
console.log("Syntax checked " + count + " runtime modules");

const css = await readFile("public/app.css", "utf8");
if (
  /^import \{|^const \$|^function /m.test(css) ||
  !css.includes(".projectbar")
)
  throw Error("Business CSS is missing or contains JavaScript");
console.log("Business CSS integrity checked");
