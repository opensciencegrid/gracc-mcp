import { loadConfig } from "./config/env.js";
import { createHttpApp } from "./http/app.js";

const main = async () => {
  const config = loadConfig();
  const app = createHttpApp(config);

  app.listen(config.httpPort, config.httpHost, (error?: Error) => {
    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    console.error(
      `GRACC MCP HTTP server listening on http://${config.httpHost}:${config.httpPort}/mcp`
    );
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
