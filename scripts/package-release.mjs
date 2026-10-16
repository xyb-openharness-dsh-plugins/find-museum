import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import http from "node:http";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
function run(command, args) {
  const r = spawnSync(command, args, { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0)
    throw Error(
      command +
        " failed: " +
        String(r.stderr || r.stdout || r.error).slice(-3500),
    );
  return r.stdout;
}
run(process.execPath, ["scripts/check-private.mjs", "."]);
await mkdir("dist", { recursive: true });
const packed = JSON.parse(
  run("npm", [
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    "dist",
  ]),
)[0];
const file = resolve("dist", packed.filename);
const paths = run("tar", ["-tzf", file]).trim().split("\n");
if (
  paths.some(
    (p) =>
      !p.startsWith("package/") ||
      p.split("/").includes("..") ||
      /node_modules|local-secrets|\.sqlite|\/data\/raw\/|\/\.env/.test(p),
  )
)
  throw Error("Unsafe/unexpected package content");
const temp = await mkdtemp(join(tmpdir(), "find-museum-package-"));
let service, server;
try {
  run("tar", ["-xzf", file, "-C", temp]);
  const dir = join(temp, "package");
  run(process.execPath, ["scripts/check-private.mjs", dir]);
  const installed = JSON.parse(
    await readFile(join(dir, "package.json"), "utf8"),
  );
  if (installed.name !== pkg.name || installed.version !== pkg.version)
    throw Error("Package identity mismatch");
  for (const entry of [pkg.main, pkg.exports["./client"], pkg.dsh.bundle.patch])
    await readFile(join(dir, entry));
  const client = await readFile(join(dir, pkg.exports["./client"]), "utf8");
  if (client.includes("__VERSION__") || !client.includes(pkg.version))
    throw Error("Client version mismatch");
  const runtime = await import(pathToFileURL(join(dir, "src/server.mjs")));
  service = runtime.createService();
  server = http.createServer(service.handle);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const health = await (await fetch(base + "/api/find-museum/health")).json(),
    catalog = await (await fetch(base + "/api/find-museum/catalog")).json(),
    page = await (await fetch(base + "/workbench/find-museum/")).text();
  if (
    !health.ok ||
    health.version !== pkg.version ||
    health.configured ||
    catalog.total !== 5535 ||
    !page.includes("博物馆清单")
  )
    throw Error("Extracted package smoke check failed");
  const bytes = await readFile(file),
    hash = createHash("sha256").update(bytes).digest("hex");
  await copyFile(file, "dist/find-museum.tgz");
  await writeFile("dist/find-museum.tgz.sha256", hash + "  find-museum.tgz\n");
  const result = {
    name: pkg.name,
    version: pkg.version,
    bytes: bytes.length,
    files: paths.length,
    sha256: hash,
    extractedRuntime: "passed",
    catalogRows: catalog.total,
    credentialsBundled: false,
  };
  await writeFile("dist/release.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (server) await new Promise((r) => server.close(r));
  service?.close();
  await rm(temp, { recursive: true, force: true });
}
