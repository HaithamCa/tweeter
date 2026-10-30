"use strict";

// Basic express setup:

const PORT               = 8080;
const express            = require("express");
const session            = require("express-session");
const db                 = require("./lib/sqlite-db");
const createSessionStore = require("./lib/session-store");
const authRoutes         = require("./routes/auth");
const app                = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  name: authRoutes.COOKIE_NAME,
  secret: process.env.SESSION_SECRET || "tweeter-dev-secret-change-me",
  store: createSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(express.static("public"));

const DataHelpers = require("./lib/data-helpers.js")(db);
const tweetsRoutes = require("./routes/tweets")(DataHelpers);
const accounts = require("./lib/accounts")(db);

app.use(authRoutes(accounts));
app.use("/tweets", tweetsRoutes);

app.listen(PORT, () => {
  console.log("Example app listening on port " + PORT);
});
