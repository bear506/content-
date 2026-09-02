import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import session from "express-session";

dotenv.config();

import "./server/db"; // initializes and seeds the SQLite DB on boot
import { SqliteSessionStore } from "./server/lib/sqliteSessionStore";
import authRoutes from "./server/routes/auth";
import brandsRoutes from "./server/routes/brands";
import campaignsRoutes from "./server/routes/campaigns";
import postsRoutes from "./server/routes/posts";
import promoCodesRoutes from "./server/routes/promoCodes";
import aiRoutes from "./server/routes/ai";
import auditLogRoutes from "./server/routes/auditLog";
import campaignTemplatesRoutes from "./server/routes/campaignTemplates";
import settingsRoutes from "./server/routes/settings";
import chatRoutes from "./server/routes/chat";

const app = express();
// Render (and most PaaS hosts) assign the port dynamically via $PORT — 3000 stays the local default.
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "10mb" }));

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is missing.");
}

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: SESSION_SECRET,
    name: "campaignai.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/brands", brandsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/promo-codes", promoCodesRoutes);
app.use("/api/campaign", aiRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/campaign-templates", campaignTemplatesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/chat", chatRoutes);

// Start Server with Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CampaignAI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
