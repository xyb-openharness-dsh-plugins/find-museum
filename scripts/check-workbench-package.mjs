#!/usr/bin/env node
// Community static checker. Does not replace official validation, pack contents or Desktop UI tests.
import { readFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
const root = resolve(process.argv[2] || ".");
const errors = [],
  warnings = [];
const check = (ok, message) => {
  if (!ok) errors.push(message);
};
function internal(path) {
  const rel = relative(root, resolve(root, path));
  return (
    rel !== "" &&
    !rel.startsWith(".." + sep) &&
    rel !== ".." &&
    !rel.startsWith(sep)
  );
}
async function file(path) {
  check(
    typeof path === "string" && internal(path),
    "Invalid package path: " + path,
  );
  if (typeof path !== "string" || !internal(path)) return "";
  try {
    const resolved = await realpath(resolve(root, path));
    const realRoot = await realpath(root),
      rel = relative(realRoot, resolved);
    if (rel.startsWith(".." + sep) || rel === "..")
      throw new Error("symlink escape");
    const stat = await lstat(resolved);
    if (!stat.isFile()) throw new Error("not a file");
    return await readFile(resolved, "utf8");
  } catch (error) {
    errors.push("Missing/unsafe file " + path + ": " + error.message);
    return "";
  }
}
try {
  const p = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  check(
    typeof p.name === "string" &&
      /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(p.name),
    "Valid npm name required",
  );
  check(
    typeof p.version === "string" &&
      /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(p.version),
    "Full semver required",
  );
  check(p.main === p.exports?.["."], 'main must match exports["."]');
  const server = await file(p.exports?.["."]);
  const client = await file(p.exports?.["./client"]);
  const patch = await file(p.dsh?.bundle?.patch);
  check(p.dsh?.client?.platform === "web", "dsh.client.platform must be web");
  check(
    p.dsh?.client?.inject?.includes("dsh-desktop-workbenches"),
    "Missing client inject dsh-desktop-workbenches",
  );
  check(
    /window\.__ModuleLoader__\.load\s*\(/.test(client),
    "Client loader missing",
  );
  const id = client.match(/(?:['"]?id['"]?)\s*:\s*(['"])(.*?)\1/);
  check(id?.[2] === p.name, "Client loader id must match npm name");
  check(
    /desktopWorkbenches\.register\s*\(/.test(client),
    "desktopWorkbenches.register missing",
  );
  check(
    /ctx\.effect\s*\(/.test(client),
    "Registration must have effect lifecycle (manual review if aliased)",
  );
  check(
    /['"]desktopWorkbenches['"]/.test(client),
    "Client service inject desktopWorkbenches missing",
  );
  const repository = client.match(
    /['"]?repository['"]?\s*:\s*['"](https:\/\/github\.com\/[^'"\s]+)['"]/,
  );
  check(
    Boolean(repository),
    "Canonical repository required in descriptor (manual review if dynamic)",
  );
  if (p.repository && repository) {
    const value =
      typeof p.repository === "string" ? p.repository : p.repository.url;
    check(
      String(value)
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
        .replace(/\/$/, "")
        .toLowerCase() === repository[1].replace(/\.git$/, "").toLowerCase(),
      "Manifest and descriptor repository disagree",
    );
  }
  const entries = [
    ...patch.matchAll(/^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/gm),
  ].map((m) => m[1]);
  check(
    /^\s*-\s+insert:/.test(patch),
    "Expected non-empty YAML insert array (other valid patches need manual review)",
  );
  check(entries.includes(p.name), "patch insert.name must be npm name");
  check(
    /export\s+(?:const|let)\s+Config\s*=\s*Schema\./.test(server),
    "Server Config must use Schemastery schema (aliases need manual review)",
  );
  check(/@deepseek-ai\/schemastery/.test(server), "Schemastery import missing");
  for (const dep of Object.keys(p.dependencies || {}))
    if (
      dep.startsWith("@deepseek-ai/") ||
      dep === "react" ||
      dep === "react-dom"
    )
      errors.push(
        "Host runtime should not be bundled as ordinary dependency: " + dep,
      );
  check(
    Array.isArray(p.files),
    "Explicit files allowlist recommended by community starter",
  );
  for (const path of [p.main, p.exports?.["./client"], p.dsh?.bundle?.patch]) {
    if (typeof path !== "string") continue;
    const normalized = path.replace(/^\.\//, "");
    if (
      !p.files?.some(
        (f) =>
          normalized === f.replace(/^\.\//, "") ||
          normalized.startsWith(
            f.replace(/^\.\//, "").replace(/\/$/, "") + "/",
          ),
      )
    )
      errors.push("Runtime entry absent from files allowlist: " + path);
  }
  if (/preserveAspectRatio\s*[:=]\s*['"]none['"]/.test(client))
    warnings.push(
      "Non-uniform SVG scaling found; manually review circles/text/chart geometry",
    );
  if (/\.ownsSession\s*\(/.test(client))
    warnings.push(
      "Review service caller context and unavailable ownership; see docs/LESSONS.md",
    );
  warnings.push(
    "Peer ranges, API signatures, credentials/assets, actual tgz contents and Desktop UI require separate verification",
  );
  console.log(
    JSON.stringify(
      {
        package: p.name,
        version: p.version,
        staticPass: errors.length === 0,
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
} catch (error) {
  console.error("Package check failed: " + error.message);
  process.exitCode = 1;
}
