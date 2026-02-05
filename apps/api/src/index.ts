import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { rateLimit } from "./middleware/rateLimit";
import authRoutes from "./routes/auth";
import adsRoutes from "./routes/ads";
import campaignsRoutes from "./routes/campaigns";
import walletRoutes from "./routes/wallet";
import settingsRoutes from "./routes/settings";
import reportRoutes from "./routes/report";
import adminRoutes from "./routes/admin";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined"));
app.use(rateLimit(120));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/ads", adsRoutes);
app.use("/campaigns", campaignsRoutes);
app.use("/wallet", walletRoutes);
app.use("/settings", settingsRoutes);
app.use("/report", reportRoutes);
app.use("/admin", adminRoutes);

app.listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
});
