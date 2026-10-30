"use strict";

const express = require("express");

const COOKIE_NAME = "tweeter.sid";

function establishSession(req, res, user, statusCode) {
  req.session.regenerate(function(err) {
    if (err) {
      res.status(500).json({ error: "Could not start a session." });
      return;
    }
    req.session.user = user;
    res.status(statusCode).json({ user: user });
  });
}

module.exports = function authRoutes(accounts) {
  const router = express.Router();

  router.get("/me", function(req, res) {
    res.set("Cache-Control", "no-store");
    res.json({ user: req.session.user || null });
  });

  router.post("/register", function(req, res) {
    const result = accounts.register(req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    establishSession(req, res, result.user, 201);
  });

  router.post("/login", function(req, res) {
    const result = accounts.authenticate(req.body || {});
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    establishSession(req, res, result.user, 200);
  });

  router.post("/logout", function(req, res) {
    req.session.destroy(function(err) {
      if (err) {
        res.status(500).json({ error: "Could not log out." });
        return;
      }
      res.clearCookie(COOKIE_NAME, { path: "/" });
      res.json({ user: null });
    });
  });

  return router;
};

module.exports.COOKIE_NAME = COOKIE_NAME;
