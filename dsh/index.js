import Schema from "@deepseek-ai/schemastery";
import { createService, routes } from "../src/server.mjs";
export const name = "find-museum-main";
export const inject = ["webServer", "connection"];
export const Config = Schema.object({});
export function apply(ctx) {
  const service = createService();
  ctx.effect(() => () => service.close());
  for (const path of routes)
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path,
          handler(req, res) {
            if (typeof ctx.connection?.requestRejection !== "function") {
              res.writeHead(503);
              res.end("Connection authentication unavailable");
              return;
            }
            const rejection = ctx.connection.requestRejection(req);
            if (rejection !== undefined) {
              res.writeHead(rejection);
              res.end("Authentication required");
              return;
            }
            return service.handle(req, res);
          },
        }),
      "find-museum " + path,
    );
}
