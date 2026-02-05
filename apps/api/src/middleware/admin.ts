import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"] as string | undefined;
  if (!config.adminApiKey || key !== config.adminApiKey) {
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}
