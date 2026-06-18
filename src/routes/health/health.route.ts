import { Hono } from "hono";
import { createHealthReport, type AppEnv } from "../../lib/app-env";

export const healthRoute = new Hono<AppEnv>();

healthRoute.get("/", (c) => {
  return c.json(createHealthReport(c.env));
});

healthRoute.get("/live", (c) => {
  return c.json({
    status: "alive",
    service: "paper-bank-backend",
    timestamp: new Date().toISOString()
  });
});

healthRoute.get("/ready", (c) => {
  const report = createHealthReport(c.env);
  const statusCode = report.status === "healthy" ? 200 : 503;

  return c.json(report, statusCode);
});
