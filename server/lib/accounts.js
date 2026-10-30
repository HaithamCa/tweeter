"use strict";

const crypto = require("crypto");

const AVATAR = "/images/profile-hex.png";

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    avatars: row.avatars
  };
}

function normalizeName(raw) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

function normalizeHandle(raw) {
  let handle = String(raw || "").trim();
  if (handle.charAt(0) === "@") handle = handle.slice(1);
  handle = handle.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
  return "@" + handle;
}

function hashPassword(password, salt) {
  const usedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, usedSalt, 32).toString("hex");
  return { salt: usedSalt, hash: hash };
}

function passwordsMatch(password, row) {
  const next = hashPassword(password, row.password_salt);
  const actual = Buffer.from(row.password_hash, "hex");
  const expected = Buffer.from(next.hash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = function makeAccounts(db) {
  const findByHandleStmt = db.prepare(`
    SELECT id, name, handle, avatars, password_salt, password_hash
    FROM users
    WHERE handle = ?
  `);

  const insertUserStmt = db.prepare(`
    INSERT INTO users (name, handle, avatars, password_salt, password_hash, created_at)
    VALUES (@name, @handle, @avatars, @password_salt, @password_hash, @created_at)
  `);

  return {
    register: function(input) {
      const name = normalizeName(input.name);
      const handle = normalizeHandle(input.handle);
      const password = String(input.password || "");

      if (!name) {
        return { error: "Name must be 1–40 characters.", status: 400 };
      }
      if (!handle) {
        return { error: "Handle must be 1–15 letters, numbers, or underscores.", status: 400 };
      }
      if (password.length < 6) {
        return { error: "Password must be at least 6 characters.", status: 400 };
      }
      if (findByHandleStmt.get(handle)) {
        return { error: "That handle is already taken.", status: 409 };
      }

      const hashed = hashPassword(password);
      const info = insertUserStmt.run({
        name: name,
        handle: handle,
        avatars: AVATAR,
        password_salt: hashed.salt,
        password_hash: hashed.hash,
        created_at: Date.now()
      });

      return {
        user: {
          id: Number(info.lastInsertRowid),
          name: name,
          handle: handle,
          avatars: AVATAR
        }
      };
    },

    authenticate: function(input) {
      const handle = normalizeHandle(input.handle);
      const password = String(input.password || "");
      if (!handle || !password) {
        return { error: "Handle and password are required.", status: 400 };
      }

      const row = findByHandleStmt.get(handle);
      if (!row || !passwordsMatch(password, row)) {
        return { error: "Handle or password is wrong.", status: 401 };
      }
      return { user: publicUser(row) };
    }
  };
};
