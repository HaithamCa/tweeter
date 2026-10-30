/*
 * Client-side logic using modern vanilla JS (fetch + DOM APIs)
 * Uses the Express/SQLite API when available, and falls back to localStorage on static hosts (e.g. GitHub Pages).
 */
const DEFAULT_AVATAR = "./images/profile-hex.png";

const escape = function (str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str || "")));
  return div.innerHTML;
};

const safeAvatar = function (url) {
  if (typeof url !== "string") return DEFAULT_AVATAR;
  if (url === "/images/profile-hex.png" || url === "./images/profile-hex.png") {
    return DEFAULT_AVATAR;
  }
  if ((url.indexOf("/images/") === 0 || url.indexOf("./images/") === 0) && url.indexOf("..") === -1) {
    return url.replace(/^\/images\//, "./images/");
  }
  if (url.indexOf("https://i.imgur.com/") === 0) return url;
  return DEFAULT_AVATAR;
};

const STORAGE_KEY = "tweeter_static_state_v1";

const loadStaticState = function () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tweets) && Array.isArray(parsed.users)) {
        return parsed;
      }
    }
  } catch (_err) {
    // Ignore storage read errors
  }

  const oneDayMs = 1000 * 60 * 60 * 24;
  const now = Date.now();
  const initialState = {
    nextUserId: 1,
    nextTweetId: 3,
    nextReplyId: 1,
    currentUserId: null,
    users: [],
    tweets: [
      {
        id: 1,
        user_id: null,
        user: {
          id: null,
          name: "Newton",
          avatars: "https://i.imgur.com/73hZDYK.png",
          handle: "@SirIsaac",
        },
        content: {
          text: "If I have seen further it is by standing on the shoulders of giants",
        },
        created_at: now - oneDayMs * 2,
        liked_user_ids: [],
        replies: [],
      },
      {
        id: 2,
        user_id: null,
        user: {
          id: null,
          name: "Descartes",
          avatars: "https://i.imgur.com/nlhLi3I.png",
          handle: "@rd",
        },
        content: {
          text: "Je pense , donc je suis",
        },
        created_at: now - oneDayMs,
        liked_user_ids: [],
        replies: [],
      },
    ],
  };

  saveStaticState(initialState);
  return initialState;
};

const saveStaticState = function (state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_err) {
    // Ignore storage write errors
  }
};

const makeHttpError = function (message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
};

const normalizeName = function (raw) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  return name;
};

const normalizeHandle = function (raw) {
  let handle = String(raw || "").trim();
  if (handle.charAt(0) === "@") handle = handle.slice(1);
  handle = handle.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
  return "@" + handle;
};

const publicStaticUser = function (user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatars: user.avatars || DEFAULT_AVATAR,
  };
};

const staticApi = {
  getMe() {
    const state = loadStaticState();
    const user = state.users.find((u) => u.id === state.currentUserId) || null;
    return { user: publicStaticUser(user) };
  },

  register(payload) {
    const state = loadStaticState();
    const name = normalizeName(payload.name);
    const handle = normalizeHandle(payload.handle);
    const password = String(payload.password || "");

    if (!name) throw makeHttpError("Name must be 1–40 characters.", 400);
    if (!handle) {
      throw makeHttpError("Handle must be 1–15 letters, numbers, or underscores.", 400);
    }
    if (password.length < 6) {
      throw makeHttpError("Password must be at least 6 characters.", 400);
    }
    if (state.users.some((u) => u.handle.toLowerCase() === handle.toLowerCase())) {
      throw makeHttpError("That handle is already taken.", 409);
    }

    const user = {
      id: state.nextUserId++,
      name,
      handle,
      avatars: DEFAULT_AVATAR,
      password,
    };
    state.users.push(user);
    state.currentUserId = user.id;
    saveStaticState(state);
    return { user: publicStaticUser(user) };
  },

  login(payload) {
    const state = loadStaticState();
    const handle = normalizeHandle(payload.handle);
    const password = String(payload.password || "");
    if (!handle || !password) {
      throw makeHttpError("Handle and password are required.", 400);
    }
    const user = state.users.find(
      (u) => u.handle.toLowerCase() === handle.toLowerCase() && u.password === password
    );
    if (!user) {
      throw makeHttpError("Handle or password is wrong.", 401);
    }
    state.currentUserId = user.id;
    saveStaticState(state);
    return { user: publicStaticUser(user) };
  },

  logout() {
    const state = loadStaticState();
    state.currentUserId = null;
    saveStaticState(state);
    return { user: null };
  },

  getTweets() {
    const state = loadStaticState();
    const viewer = state.users.find((u) => u.id === state.currentUserId) || null;
    return state.tweets
      .slice()
      .sort((a, b) => a.created_at - b.created_at || a.id - b.id)
      .map((t) => {
        const likedIds = Array.isArray(t.liked_user_ids) ? t.liked_user_ids : [];
        return {
          id: t.id,
          user: t.user,
          content: t.content,
          created_at: t.created_at,
          likes_count: likedIds.length,
          liked_by_me: Boolean(viewer && likedIds.includes(viewer.id)),
          owned_by_me: Boolean(viewer && t.user_id === viewer.id),
          replies: Array.isArray(t.replies) ? t.replies : [],
        };
      });
  },

  createTweet(payload) {
    const state = loadStaticState();
    const viewer = state.users.find((u) => u.id === state.currentUserId) || null;
    if (!viewer) throw makeHttpError("Sign in to post a tweet.", 401);

    const text = String((payload && payload.text) || "").trim();
    if (!text) throw makeHttpError("Your tweet is empty", 400);
    if (text.length > 140) throw makeHttpError("Tweet is longer than 140 characters.", 400);

    state.tweets.push({
      id: state.nextTweetId++,
      user_id: viewer.id,
      user: publicStaticUser(viewer),
      content: { text },
      created_at: Date.now(),
      liked_user_ids: [],
      replies: [],
    });
    saveStaticState(state);
    return {};
  },

  toggleLike(tweetId) {
    const state = loadStaticState();
    const viewer = state.users.find((u) => u.id === state.currentUserId) || null;
    if (!viewer) throw makeHttpError("Sign in to like tweets.", 401);

    const tweet = state.tweets.find((t) => t.id === tweetId);
    if (!tweet) throw makeHttpError("Tweet not found.", 404);

    if (!Array.isArray(tweet.liked_user_ids)) tweet.liked_user_ids = [];
    const idx = tweet.liked_user_ids.indexOf(viewer.id);
    let liked = false;
    if (idx >= 0) {
      tweet.liked_user_ids.splice(idx, 1);
      liked = false;
    } else {
      tweet.liked_user_ids.push(viewer.id);
      liked = true;
    }
    saveStaticState(state);
    return {
      liked,
      likes_count: tweet.liked_user_ids.length,
    };
  },

  deleteTweet(tweetId) {
    const state = loadStaticState();
    const viewer = state.users.find((u) => u.id === state.currentUserId) || null;
    if (!viewer) throw makeHttpError("Sign in to delete tweets.", 401);

    const idx = state.tweets.findIndex((t) => t.id === tweetId);
    if (idx === -1) throw makeHttpError("Tweet not found.", 404);
    if (state.tweets[idx].user_id !== viewer.id) {
      throw makeHttpError("You can only delete your own tweets.", 403);
    }
    state.tweets.splice(idx, 1);
    saveStaticState(state);
    return { deleted: true };
  },

  addReply(tweetId, payload) {
    const state = loadStaticState();
    const viewer = state.users.find((u) => u.id === state.currentUserId) || null;
    if (!viewer) throw makeHttpError("Sign in to reply to tweets.", 401);

    const tweet = state.tweets.find((t) => t.id === tweetId);
    if (!tweet) throw makeHttpError("Tweet not found.", 404);

    const text = String((payload && payload.text) || "").trim();
    if (!text) throw makeHttpError("Reply cannot be empty.", 400);
    if (text.length > 140) throw makeHttpError("Reply is longer than 140 characters.", 400);

    if (!Array.isArray(tweet.replies)) tweet.replies = [];
    const reply = {
      id: state.nextReplyId++,
      tweet_id: tweetId,
      user: publicStaticUser(viewer),
      content: { text },
      created_at: Date.now(),
    };
    tweet.replies.push(reply);
    saveStaticState(state);
    return { reply };
  },
};

const openReplyBoxes = new Set();
let currentUser = null;
let authMode = "register";
let backendMode = null; // "server" | "static"

const detectBackendMode = async function () {
  if (backendMode) return backendMode;
  try {
    const response = await fetch("./me", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      backendMode = "server";
      return backendMode;
    }
  } catch (_err) {
    // Fall back to static mode
  }
  backendMode = "static";
  return backendMode;
};

const requestJson = async function (url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    const error = new Error((data && data.error) || "Request failed.");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const postForm = function (url, payload) {
  return requestJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams(payload).toString(),
  });
};

const api = {
  async getMe() {
    if ((await detectBackendMode()) === "static") return staticApi.getMe();
    return requestJson("./me");
  },
  async register(payload) {
    if ((await detectBackendMode()) === "static") return staticApi.register(payload);
    return postForm("./register", payload);
  },
  async login(payload) {
    if ((await detectBackendMode()) === "static") return staticApi.login(payload);
    return postForm("./login", payload);
  },
  async logout() {
    if ((await detectBackendMode()) === "static") return staticApi.logout();
    return requestJson("./logout", { method: "POST" });
  },
  async getTweets() {
    if ((await detectBackendMode()) === "static") return staticApi.getTweets();
    return requestJson("./tweets");
  },
  async createTweet(payload) {
    if ((await detectBackendMode()) === "static") return staticApi.createTweet(payload);
    return postForm("./tweets", payload);
  },
  async toggleLike(tweetId) {
    if ((await detectBackendMode()) === "static") return staticApi.toggleLike(tweetId);
    return requestJson(`./tweets/${tweetId}/like`, { method: "POST" });
  },
  async deleteTweet(tweetId) {
    if ((await detectBackendMode()) === "static") return staticApi.deleteTweet(tweetId);
    return requestJson(`./tweets/${tweetId}`, { method: "DELETE" });
  },
  async addReply(tweetId, payload) {
    if ((await detectBackendMode()) === "static") return staticApi.addReply(tweetId, payload);
    return postForm(`./tweets/${tweetId}/replies`, payload);
  },
};

const createReplyItemHtml = function (reply) {
  const timeText = timeago.format(reply.created_at);
  const name = escape((reply.user && reply.user.name) || "");
  const handle = escape((reply.user && reply.user.handle) || "");
  const avatar = safeAvatar(reply.user && reply.user.avatars);
  const text = escape((reply.content && reply.content.text) || "");

  return `
    <li class="tweet-reply-item">
      <div class="tweet-reply-meta">
        <img src="${avatar}" alt="" />
        <strong>${name}</strong>
        <span class="tweet-reply-handle">${handle}</span>
        <span class="tweet-reply-time">${timeText}</span>
      </div>
      <p class="tweet-reply-text">${text}</p>
    </li>
  `;
};

const createTweetHtml = function (tweetObject) {
  const tweetId = Number(tweetObject.id) || 0;
  const updatedTimeAgo = timeago.format(tweetObject.created_at);
  const name = escape(tweetObject.user.name || "");
  const handle = escape(tweetObject.user.handle || "");
  const likesCount = Number(tweetObject.likes_count || 0);
  const likedByMe = Boolean(tweetObject.liked_by_me);
  const ownedByMe = Boolean(tweetObject.owned_by_me);
  const replies = Array.isArray(tweetObject.replies) ? tweetObject.replies : [];
  const replyPanelOpen = openReplyBoxes.has(tweetId) || replies.length > 0;

  const repliesHtml = replies.map(createReplyItemHtml).join("");
  const deleteButtonHtml = ownedByMe
    ? `<button type="button" class="tweet-action tweet-delete-btn" data-tweet-id="${tweetId}" aria-label="Delete tweet" title="Delete tweet">
         <i class="fas fa-trash-alt"></i>
       </button>`
    : "";

  const replyFormHtml = currentUser
    ? `<form class="tweet-reply-form ${openReplyBoxes.has(tweetId) ? "" : "is-hidden"}" data-tweet-id="${tweetId}">
         <input type="text" name="text" class="tweet-reply-input" maxlength="140" placeholder="Write a reply..." />
         <button type="submit" class="tweet-reply-submit">Reply</button>
       </form>`
    : `<p class="tweet-reply-signin ${openReplyBoxes.has(tweetId) ? "" : "is-hidden"}">Sign in to reply.</p>`;

  return `
    <article class="tweet" data-tweet-id="${tweetId}">
      <header>
        <div>
          <img src="${safeAvatar(tweetObject.user.avatars)}" alt="" />
          <h3>${name}</h3>
        </div>
        <h4>${handle}</h4>
      </header>
      <p class="tweet-content">${escape(tweetObject.content.text)}</p>
      <footer>
        <span class="need_to_be_rendered" datetime="">${updatedTimeAgo}</span>
        <div class="tweet-actions">
          <button type="button" class="tweet-action tweet-reply-toggle" data-tweet-id="${tweetId}" aria-label="Reply to tweet" title="Reply">
            <i class="fas fa-reply"></i>
            <span class="reply-count">${replies.length}</span>
          </button>
          <button type="button" class="tweet-action tweet-like-btn ${likedByMe ? "is-liked" : ""}" data-tweet-id="${tweetId}" aria-pressed="${likedByMe}" aria-label="Like tweet" title="Like">
            <i class="fas fa-heart"></i>
            <span class="like-count">${likesCount}</span>
          </button>
          ${deleteButtonHtml}
        </div>
      </footer>
      <p class="tweet-action-error is-hidden"></p>
      <section class="tweet-replies ${replyPanelOpen ? "" : "is-hidden"}" data-tweet-id="${tweetId}">
        <ul class="tweet-replies-list">${repliesHtml}</ul>
        ${replyFormHtml}
      </section>
    </article>
  `;
};

const renderTweets = function (tweets) {
  const container = document.getElementById("tweets-container");
  if (!container) return;
  container.innerHTML = "";
  tweets.forEach((tweet) => {
    container.insertAdjacentHTML("afterbegin", createTweetHtml(tweet));
  });
};

const loadTweets = async function () {
  const data = await api.getTweets();
  renderTweets(Array.isArray(data) ? data : []);
};

const showComposeError = function (message) {
  const box = document.querySelector(".error-message");
  if (!box) return;
  const icon = box.querySelector("i");
  box.style.display = "block";
  if (icon) {
    icon.className = "fas fa-exclamation-triangle red-flag";
    icon.textContent = " " + message;
  }
};

const hideComposeError = function () {
  const box = document.querySelector(".error-message");
  if (!box) return;
  box.style.display = "none";
};

const showTweetActionError = function (article, message) {
  if (!article) return;
  const errEl = article.querySelector(".tweet-action-error");
  if (!errEl) return;
  if (!message) {
    errEl.textContent = "";
    errEl.classList.add("is-hidden");
    return;
  }
  errEl.textContent = message;
  errEl.classList.remove("is-hidden");
};

const showAuthError = function (message) {
  const errorEl = document.getElementById("auth-error");
  if (!errorEl) return;
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("is-hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("is-hidden");
};

const renderProfile = function () {
  const nameEl = document.getElementById("profile-name");
  const handleEl = document.getElementById("profile-handle");
  const avatarEl = document.getElementById("profile-avatar");
  const identityEl = document.getElementById("profile-identity");
  const authFormEl = document.getElementById("auth-form");
  const composeHintEl = document.getElementById("compose-hint");

  if (currentUser) {
    nameEl.textContent = currentUser.name;
    handleEl.textContent = currentUser.handle;
    avatarEl.setAttribute("alt", currentUser.name);
    identityEl.classList.remove("is-hidden");
    authFormEl.classList.add("is-hidden");
    composeHintEl.classList.add("is-hidden");
    return;
  }

  nameEl.textContent = "";
  handleEl.textContent = "";
  avatarEl.setAttribute("alt", "");
  identityEl.classList.add("is-hidden");
  authFormEl.classList.remove("is-hidden");
  composeHintEl.classList.remove("is-hidden");
};

const setAuthMode = function (mode) {
  authMode = mode;
  const registering = mode === "register";
  document.getElementById("auth-name-field").classList.toggle("is-hidden", !registering);
  document.getElementById("auth-title").textContent = registering ? "Create your account" : "Sign in";
  document.getElementById("auth-submit").textContent = registering ? "Create account" : "Sign in";
  document.getElementById("auth-toggle").textContent = registering
    ? "Already have an account? Sign in"
    : "New here? Create an account";
  document
    .getElementById("auth-password")
    .setAttribute("autocomplete", registering ? "new-password" : "current-password");
  showAuthError("");
};

document.addEventListener("DOMContentLoaded", () => {
  const composeForm = document.getElementById("compose");
  const tweetTextarea = document.getElementById("tweet-text");
  const tweetsContainer = document.getElementById("tweets-container");
  const authForm = document.getElementById("auth-form");
  const authToggle = document.getElementById("auth-toggle");
  const writeTweetToggle = document.getElementById("write-tweet-toggle");
  const newTweetSection = document.getElementById("new-tweet-section");
  const logoutButton = document.getElementById("logout-button");

  composeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tweet = tweetTextarea.value.trim();

    if (!currentUser) {
      showComposeError("Sign in to post a tweet.");
      return;
    }
    if (!tweet) {
      showComposeError("Your tweet is empty");
      return;
    }
    if (tweet.length > 140) {
      showComposeError("Your tweet is longer than 140 characters");
      return;
    }

    try {
      await api.createTweet({ text: tweet });
      tweetTextarea.value = "";
      const counter = composeForm.querySelector(".counter");
      if (counter) {
        counter.textContent = "140";
        counter.classList.remove("red-flag");
      }
      hideComposeError();
      await loadTweets();
    } catch (err) {
      showComposeError(err.message || "Could not post your tweet.");
    }
  });

  tweetsContainer.addEventListener("click", async (event) => {
    const likeBtn = event.target.closest(".tweet-like-btn");
    if (likeBtn) {
      const article = likeBtn.closest("article.tweet");
      const tweetId = Number(likeBtn.getAttribute("data-tweet-id"));
      showTweetActionError(article, "");

      if (!currentUser) {
        showTweetActionError(article, "Sign in to like tweets.");
        return;
      }

      try {
        const data = await api.toggleLike(tweetId);
        const liked = Boolean(data && data.liked);
        likeBtn.classList.toggle("is-liked", liked);
        likeBtn.setAttribute("aria-pressed", String(liked));
        const countEl = likeBtn.querySelector(".like-count");
        if (countEl) {
          countEl.textContent = String(Number((data && data.likes_count) || 0));
        }
      } catch (err) {
        showTweetActionError(article, err.message || "Could not update like.");
      }
      return;
    }

    const deleteBtn = event.target.closest(".tweet-delete-btn");
    if (deleteBtn) {
      const article = deleteBtn.closest("article.tweet");
      const tweetId = Number(deleteBtn.getAttribute("data-tweet-id"));
      showTweetActionError(article, "");

      try {
        await api.deleteTweet(tweetId);
        openReplyBoxes.delete(tweetId);
        article.remove();
      } catch (err) {
        showTweetActionError(article, err.message || "Could not delete tweet.");
      }
      return;
    }

    const replyToggle = event.target.closest(".tweet-reply-toggle");
    if (replyToggle) {
      const article = replyToggle.closest("article.tweet");
      const tweetId = Number(replyToggle.getAttribute("data-tweet-id"));
      const repliesSection = article.querySelector(".tweet-replies");
      const replyForm = article.querySelector(".tweet-reply-form");
      const replySignin = article.querySelector(".tweet-reply-signin");

      showTweetActionError(article, "");

      if (openReplyBoxes.has(tweetId)) {
        openReplyBoxes.delete(tweetId);
        if (replyForm) replyForm.classList.add("is-hidden");
        if (replySignin) replySignin.classList.add("is-hidden");
        if (article.querySelectorAll(".tweet-reply-item").length === 0 && repliesSection) {
          repliesSection.classList.add("is-hidden");
        }
        return;
      }

      openReplyBoxes.add(tweetId);
      if (repliesSection) repliesSection.classList.remove("is-hidden");
      if (replyForm) {
        replyForm.classList.remove("is-hidden");
        const input = replyForm.querySelector(".tweet-reply-input");
        if (input) input.focus();
      }
      if (replySignin) replySignin.classList.remove("is-hidden");
    }
  });

  tweetsContainer.addEventListener("submit", async (event) => {
    const replyForm = event.target.closest(".tweet-reply-form");
    if (!replyForm) return;
    event.preventDefault();

    const article = replyForm.closest("article.tweet");
    const tweetId = Number(replyForm.getAttribute("data-tweet-id"));
    const input = replyForm.querySelector(".tweet-reply-input");
    const text = String((input && input.value) || "").trim();

    showTweetActionError(article, "");

    if (!currentUser) {
      showTweetActionError(article, "Sign in to reply to tweets.");
      return;
    }
    if (!text) {
      showTweetActionError(article, "Reply cannot be empty.");
      return;
    }
    if (text.length > 140) {
      showTweetActionError(article, "Reply is longer than 140 characters.");
      return;
    }

    try {
      const data = await api.addReply(tweetId, { text });
      if (input) input.value = "";
      if (data && data.reply) {
        const list = article.querySelector(".tweet-replies-list");
        if (list) {
          list.insertAdjacentHTML("beforeend", createReplyItemHtml(data.reply));
          const nextCount = list.querySelectorAll(".tweet-reply-item").length;
          const countEl = article.querySelector(".reply-count");
          if (countEl) countEl.textContent = String(nextCount);
        }
        const repliesSection = article.querySelector(".tweet-replies");
        if (repliesSection) repliesSection.classList.remove("is-hidden");
      } else {
        await loadTweets();
      }
    } catch (err) {
      showTweetActionError(article, err.message || "Could not post reply.");
    }
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      handle: document.getElementById("auth-handle").value,
      password: document.getElementById("auth-password").value,
    };
    if (authMode === "register") {
      payload.name = document.getElementById("auth-name").value;
    }

    try {
      const data =
        authMode === "register" ? await api.register(payload) : await api.login(payload);
      currentUser = data.user;
      document.getElementById("auth-password").value = "";
      showAuthError("");
      hideComposeError();
      renderProfile();
      await loadTweets();
      tweetTextarea.focus();
    } catch (err) {
      showAuthError(err.message || "Could not sign in.");
    }
  });

  authToggle.addEventListener("click", () => {
    setAuthMode(authMode === "register" ? "login" : "register");
  });

  writeTweetToggle.addEventListener("click", () => {
    const isHidden = newTweetSection.classList.contains("is-hidden");
    if (!isHidden) {
      writeTweetToggle.setAttribute("aria-expanded", "false");
      newTweetSection.classList.add("is-hidden");
      return;
    }

    writeTweetToggle.setAttribute("aria-expanded", "true");
    newTweetSection.classList.remove("is-hidden");
    const rect = newTweetSection.getBoundingClientRect();
    if (rect.top < 96 || rect.bottom > window.innerHeight) {
      newTweetSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    tweetTextarea.focus();
  });

  logoutButton.addEventListener("click", async () => {
    await api.logout();
    currentUser = null;
    renderProfile();
    await loadTweets();
  });

  api
    .getMe()
    .then((data) => {
      currentUser = data ? data.user : null;
      renderProfile();
      return loadTweets();
    })
    .catch(() => {
      currentUser = null;
      renderProfile();
      return loadTweets();
    });
});
