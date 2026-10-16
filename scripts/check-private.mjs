import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, relative } from "node:path";
const root = resolve(process.argv[2] || "."),
  secrets = [];
try {
  const j = JSON.parse(
    await readFile(
      process.env.FIND_MUSEUM_SECRETS_FILE ||
        join(homedir(), ".config/find-museum/local-secrets.json"),
      "utf8",
    ),
  );
  for (const v of Object.values(j))
    if (typeof v === "string" && v.length >= 20) secrets.push(Buffer.from(v));
} catch (e) {
  if (e.code !== "ENOENT")
    throw Error("Cannot read local secrets for private-file check");
}
let count = 0;
const failures = [];
async function walk(path) {
  for (const e of await readdir(path, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "_private"].includes(e.name)) continue;
    const p = join(path, e.name),
      rel = relative(root, p);
    if (e.isDirectory()) await walk(p);
    else if (e.isFile()) {
      count++;
      if (
        /(^|\/)(local-secrets\.json|\.env(?:\..*)?)$|\.(sqlite(?:-wal|-shm)?|db)$/i.test(
          rel,
        )
      )
        failures.push(rel + " (private file)");
      const b = await readFile(p);
      if (secrets.some((k) => b.includes(k)))
        failures.push(rel + " (local credential)");
    }
  }
}
await walk(root);
if (failures.length)
  throw Error("Private material found in: " + failures.join(", "));
console.log(
  JSON.stringify({
    privateScan: "passed",
    files: count,
    knownLocalSecretsChecked: secrets.length,
  }),
);
