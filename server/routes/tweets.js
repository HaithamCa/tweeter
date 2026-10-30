"use strict";

const express       = require("express");
const tweetsRoutes  = express.Router();

function parseTweetId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

module.exports = function(DataHelpers) {

  tweetsRoutes.get("/", function(req, res) {
    const viewer = req.session && req.session.user ? req.session.user : null;
    res.set("Cache-Control", "no-store");
    DataHelpers.getTweets(viewer, (err, tweets) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(tweets);
      }
    });
  });

  tweetsRoutes.post("/", function(req, res) {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: "Sign in to post a tweet." });
      return;
    }

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "invalid request: no data in POST body" });
      return;
    }
    if (text.length > 140) {
      res.status(400).json({ error: "Tweet is longer than 140 characters." });
      return;
    }

    const sessionUser = req.session.user;
    const tweet = {
      user: {
        id: sessionUser.id,
        name: sessionUser.name,
        handle: sessionUser.handle,
        avatars: sessionUser.avatars
      },
      content: {
        text: text
      },
      created_at: Date.now()
    };

    DataHelpers.saveTweet(tweet, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(201).send();
      }
    });
  });

  tweetsRoutes.post("/:id/like", function(req, res) {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: "Sign in to like tweets." });
      return;
    }
    const tweetId = parseTweetId(req.params.id);
    if (!tweetId) {
      res.status(400).json({ error: "Invalid tweet ID." });
      return;
    }

    DataHelpers.toggleLike(tweetId, req.session.user.id, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (result.error) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.json({
        liked: result.liked,
        likes_count: result.likesCount
      });
    });
  });

  tweetsRoutes.delete("/:id", function(req, res) {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: "Sign in to delete tweets." });
      return;
    }
    const tweetId = parseTweetId(req.params.id);
    if (!tweetId) {
      res.status(400).json({ error: "Invalid tweet ID." });
      return;
    }

    DataHelpers.deleteTweet(tweetId, req.session.user, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (result.error) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.json({ deleted: true });
    });
  });

  tweetsRoutes.post("/:id/replies", function(req, res) {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: "Sign in to reply to tweets." });
      return;
    }
    const tweetId = parseTweetId(req.params.id);
    if (!tweetId) {
      res.status(400).json({ error: "Invalid tweet ID." });
      return;
    }

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "Reply cannot be empty." });
      return;
    }
    if (text.length > 140) {
      res.status(400).json({ error: "Reply is longer than 140 characters." });
      return;
    }

    const sessionUser = req.session.user;
    DataHelpers.addReply(
      tweetId,
      {
        user: {
          id: sessionUser.id,
          name: sessionUser.name,
          handle: sessionUser.handle,
          avatars: sessionUser.avatars
        },
        content: {
          text: text
        },
        created_at: Date.now()
      },
      (err, result) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        if (result.error) {
          res.status(result.status || 400).json({ error: result.error });
          return;
        }
        res.status(201).json(result);
      }
    );
  });

  return tweetsRoutes;
};
