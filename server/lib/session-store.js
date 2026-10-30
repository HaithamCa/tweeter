"use strict";

const session = require("express-session");

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

module.exports = function createSqliteSessionStore(db) {
  class SqliteSessionStore extends session.Store {
    constructor() {
      super();
      this.getStmt = db.prepare("SELECT sess, expires FROM sessions WHERE sid = ?");
      this.deleteStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
      this.upsertStmt = db.prepare(`
        INSERT INTO sessions (sid, sess, expires)
        VALUES (@sid, @sess, @expires)
        ON CONFLICT(sid) DO UPDATE SET
          sess = excluded.sess,
          expires = excluded.expires
      `);
      this.pruneStmt = db.prepare("DELETE FROM sessions WHERE expires <= ?");
    }

    get(sid, callback) {
      try {
        const now = Date.now();
        const row = this.getStmt.get(sid);
        if (!row) {
          return callback(null, null);
        }
        if (row.expires <= now) {
          this.deleteStmt.run(sid);
          return callback(null, null);
        }
        return callback(null, JSON.parse(row.sess));
      } catch (err) {
        return callback(err);
      }
    }

    set(sid, sess, callback) {
      try {
        const now = Date.now();
        const maxAge = sess && sess.cookie && typeof sess.cookie.maxAge === "number"
          ? sess.cookie.maxAge
          : ONE_DAY_MS * 7;
        const expires = sess && sess.cookie && sess.cookie.expires
          ? new Date(sess.cookie.expires).getTime()
          : now + maxAge;

        this.pruneStmt.run(now);
        this.upsertStmt.run({
          sid: sid,
          sess: JSON.stringify(sess),
          expires: expires
        });
        if (callback) callback(null);
      } catch (err) {
        if (callback) callback(err);
      }
    }

    touch(sid, sess, callback) {
      this.set(sid, sess, callback);
    }

    destroy(sid, callback) {
      try {
        this.deleteStmt.run(sid);
        if (callback) callback(null);
      } catch (err) {
        if (callback) callback(err);
      }
    }
  }

  return new SqliteSessionStore();
};
