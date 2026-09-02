import type { Request, Response, NextFunction } from "express";

export type Role = "admin" | "editor" | "viewer";

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated." });
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}
