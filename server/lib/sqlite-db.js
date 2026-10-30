"use strict";

const path = require("path");
const Database = require("better-sqlite3");
const initialTweets = require("../data-files/initial-tweets.json");

const DB_PATH = process.env.TWEETER_DB_PATH || path.join(__dirname, "../data-files/tweeter.sqlite");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
    avatars TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tweets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_handle TEXT NOT NULL,
    author_avatars TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tweet_likes (
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tweet_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tweet_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_handle TEXT NOT NULL,
    author_avatars TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
  CREATE INDEX IF NOT EXISTS idx_tweet_likes_tweet_id ON tweet_likes(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_tweet_replies_tweet_id ON tweet_replies(tweet_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

function seedInitialTweets() {
  const countRow = sqlite.prepare("SELECT COUNT(*) AS count FROM tweets").get();
  if (countRow && countRow.count > 0) {
    return;
  }

  const oneDayMs = 1000 * 60 * 60 * 24;
  const now = Date.now();
  const insertTweet = sqlite.prepare(`
    INSERT INTO tweets (user_id, author_name, author_handle, author_avatars, text, created_at)
    VALUES (@user_id, @author_name, @author_handle, @author_avatars, @text, @created_at)
  `);

  const insertMany = sqlite.transaction((tweets) => {
    tweets.forEach((tweet, index) => {
      insertTweet.run({
        user_id: null,
        author_name: tweet.user.name,
        author_handle: tweet.user.handle,
        author_avatars: tweet.user.avatars,
        text: tweet.content.text,
        created_at: now - oneDayMs * (tweets.length - index)
      });
    });
  });

  insertMany(initialTweets);
}

seedInitialTweets();

module.exports = sqlite;
module.exports.DB_PATH = DB_PATH;
