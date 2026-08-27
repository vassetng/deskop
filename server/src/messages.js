import express from "express";
import { getDmMessages, getChannelMessages } from "./store.js";
import { authMiddleware, requireAuth } from "./auth.js";

export function createMessagesRouter() {
  const router = express.Router();

  router.get("/", authMiddleware, requireAuth, (req, res) => {
    const { kind, with: withId, department } = req.query;

    if (kind === "dm") {
      if (!withId) return res.status(400).json({ error: "with is required for DMs" });
      return res.json(getDmMessages(req.staff.id, withId));
    }

    if (kind === "channel") {
      if (!department) return res.status(400).json({ error: "department is required for channels" });
      if (req.staff.role !== "admin" && req.staff.department !== department) {
        return res.status(403).json({ error: "Not a member of this department" });
      }
      return res.json(getChannelMessages(department));
    }

    return res.status(400).json({ error: "kind must be 'dm' or 'channel'" });
  });

  return router;
}
