import { createService } from "../src/server.mjs";
const service = createService();
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  if (
    req.url?.startsWith("/api/find-museum/") ||
    req.url?.startsWith("/workbench/find-museum/")
  )
    return service.handle(req, res);
  if (req.url === "/") {
    res.writeHead(302, { location: "/design/prototype-v0.2.html" });
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      rel = pathname === "/" ? "design/prototype-v0.1.html" : pathname.slice(1);
    if (
      !["design/", "src/domain/", "data/processed/", "public/", "assets/"].some(
        (p) => rel.startsWith(p),
      )
    )
      throw Error("outside preview");
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) throw Error("outside root");
    const s = await stat(file);
    if (!s.isFile()) throw Error("not file");
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(4387, "127.0.0.1", () =>
  console.log("Design preview: http://127.0.0.1:4387/ (Ctrl+C to stop)"),
);
