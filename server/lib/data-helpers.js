"use strict";

function rowToReply(row) {
  return {
    id: row.id,
    tweet_id: row.tweet_id,
    user: {
      id: row.user_id || null,
      name: row.author_name,
      handle: row.author_handle,
      avatars: row.author_avatars
    },
    content: {
      text: row.text
    },
    created_at: row.created_at
  };
}

// Defines helper functions for tweets, likes, deletions, and replies using the SQLite database `db`
module.exports = function makeDataHelpers(db) {
  const insertTweetStmt = db.prepare(`
    INSERT INTO tweets (user_id, author_name, author_handle, author_avatars, text, created_at)
    VALUES (@user_id, @author_name, @author_handle, @author_avatars, @text, @created_at)
  `);

  const selectTweetsStmt = db.prepare(`
    SELECT
      t.id,
      t.user_id,
      t.author_name,
      t.author_handle,
      t.author_avatars,
      t.text,
      t.created_at,
      COUNT(tl.user_id) AS likes_count,
      MAX(CASE WHEN tl.user_id = @viewer_id THEN 1 ELSE 0 END) AS liked_by_me
    FROM tweets t
    LEFT JOIN tweet_likes tl ON tl.tweet_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at ASC, t.id ASC
  `);

  const selectRepliesStmt = db.prepare(`
    SELECT id, tweet_id, user_id, author_name, author_handle, author_avatars, text, created_at
    FROM tweet_replies
    ORDER BY created_at ASC, id ASC
  `);

  const findTweetStmt = db.prepare("SELECT id, user_id, author_handle FROM tweets WHERE id = ?");
  const findLikeStmt = db.prepare("SELECT 1 FROM tweet_likes WHERE tweet_id = ? AND user_id = ?");
  const insertLikeStmt = db.prepare(`
    INSERT INTO tweet_likes (tweet_id, user_id, created_at)
    VALUES (?, ?, ?)
  `);
  const deleteLikeStmt = db.prepare("DELETE FROM tweet_likes WHERE tweet_id = ? AND user_id = ?");
  const countLikesStmt = db.prepare("SELECT COUNT(*) AS count FROM tweet_likes WHERE tweet_id = ?");
  const deleteTweetStmt = db.prepare("DELETE FROM tweets WHERE id = ?");

  const insertReplyStmt = db.prepare(`
    INSERT INTO tweet_replies (tweet_id, user_id, author_name, author_handle, author_avatars, text, created_at)
    VALUES (@tweet_id, @user_id, @author_name, @author_handle, @author_avatars, @text, @created_at)
  `);

  const toggleLikeTx = db.transaction((tweetId, userId) => {
    const tweet = findTweetStmt.get(tweetId);
    if (!tweet) {
      return { status: 404, error: "Tweet not found." };
    }

    const alreadyLiked = Boolean(findLikeStmt.get(tweetId, userId));
    if (alreadyLiked) {
      deleteLikeStmt.run(tweetId, userId);
    } else {
      insertLikeStmt.run(tweetId, userId, Date.now());
    }

    const likesRow = countLikesStmt.get(tweetId);
    return {
      liked: !alreadyLiked,
      likesCount: likesRow ? likesRow.count : 0
    };
  });

  return {
    // Saves a tweet to `db`
    saveTweet: function(newTweet, callback) {
      try {
        const info = insertTweetStmt.run({
          user_id: newTweet.user && newTweet.user.id ? newTweet.user.id : null,
          author_name: newTweet.user.name,
          author_handle: newTweet.user.handle,
          author_avatars: newTweet.user.avatars,
          text: newTweet.content.text,
          created_at: newTweet.created_at
        });
        callback(null, Number(info.lastInsertRowid));
      } catch (err) {
        callback(err);
      }
    },

    // Get all tweets in `db`, sorted oldest-to-newest so client prepend puts newest on top
    getTweets: function(viewerOrCallback, maybeCallback) {
      const callback = typeof viewerOrCallback === "function" ? viewerOrCallback : maybeCallback;
      const viewer = typeof viewerOrCallback === "function" ? null : viewerOrCallback;
      const viewerId = viewer && viewer.id ? viewer.id : -1;
      const viewerHandle = viewer && viewer.handle ? String(viewer.handle).toLowerCase() : null;

      try {
        const rows = selectTweetsStmt.all({ viewer_id: viewerId });
        const replyRows = selectRepliesStmt.all();
        const repliesByTweet = new Map();

        replyRows.forEach((replyRow) => {
          const list = repliesByTweet.get(replyRow.tweet_id) || [];
          list.push(rowToReply(replyRow));
          repliesByTweet.set(replyRow.tweet_id, list);
        });

        const tweets = rows.map((row) => {
          const isOwner = Boolean(
            viewer && (
              (row.user_id && row.user_id === viewer.id) ||
              (!row.user_id && viewerHandle && String(row.author_handle).toLowerCase() === viewerHandle)
            )
          );
          return {
            id: row.id,
            user: {
              id: row.user_id || null,
              name: row.author_name,
              handle: row.author_handle,
              avatars: row.author_avatars
            },
            content: {
              text: row.text
            },
            created_at: row.created_at,
            likes_count: Number(row.likes_count || 0),
            liked_by_me: Boolean(row.liked_by_me),
            owned_by_me: isOwner,
            replies: repliesByTweet.get(row.id) || []
          };
        });

        callback(null, tweets);
      } catch (err) {
        callback(err);
      }
    },

    toggleLike: function(tweetId, userId, callback) {
      try {
        const result = toggleLikeTx(tweetId, userId);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
    },

    deleteTweet: function(tweetId, user, callback) {
      try {
        const tweet = findTweetStmt.get(tweetId);
        if (!tweet) {
          return callback(null, { status: 404, error: "Tweet not found." });
        }

        const isOwner = Boolean(
          user && (
            (tweet.user_id && tweet.user_id === user.id) ||
            (!tweet.user_id && user.handle && String(tweet.author_handle).toLowerCase() === String(user.handle).toLowerCase())
          )
        );
        if (!isOwner) {
          return callback(null, { status: 403, error: "You can only delete your own tweets." });
        }

        deleteTweetStmt.run(tweetId);
        return callback(null, { deleted: true });
      } catch (err) {
        return callback(err);
      }
    },

    addReply: function(tweetId, replyData, callback) {
      try {
        const tweet = findTweetStmt.get(tweetId);
        if (!tweet) {
          return callback(null, { status: 404, error: "Tweet not found." });
        }

        const createdAt = replyData.created_at || Date.now();
        const info = insertReplyStmt.run({
          tweet_id: tweetId,
          user_id: replyData.user.id || null,
          author_name: replyData.user.name,
          author_handle: replyData.user.handle,
          author_avatars: replyData.user.avatars,
          text: replyData.content.text,
          created_at: createdAt
        });

        return callback(null, {
          reply: {
            id: Number(info.lastInsertRowid),
            tweet_id: tweetId,
            user: {
              id: replyData.user.id || null,
              name: replyData.user.name,
              handle: replyData.user.handle,
              avatars: replyData.user.avatars
            },
            content: {
              text: replyData.content.text
            },
            created_at: createdAt
          }
        });
      } catch (err) {
        return callback(err);
      }
    }
  };
};
