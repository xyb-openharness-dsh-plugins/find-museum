import http from "node:http";
import { createService } from "../src/server.mjs";
const port = Number(process.env.FIND_MUSEUM_DEV_PORT || 4390);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid development port");
const service = createService(),
  server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(302, { location: "/workbench/find-museum/" });
      res.end();
      return;
    }
    return service.handle(req, res);
  });
if (process.env.FIND_MUSEUM_DEV_ROOT)
  await service.configure(process.env.FIND_MUSEUM_DEV_ROOT);
server.listen(port, "127.0.0.1", () =>
  console.log("Local app: http://127.0.0.1:" + port + "/"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
