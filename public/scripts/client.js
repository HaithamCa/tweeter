/*
 * Client-side JS logic goes here
 * jQuery is already loaded
 * Reminder: Use (and do all your DOM work in) jQuery's document ready function
 */
// Preventing XSS with Escaping
const escape = function (str) {
  let div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

const renderTweets = function (tweets) {
  return tweets.forEach((tweet) => {
    $("#tweets-container").prepend(createTweetElement(tweet));
  });
};
// Create the tweet and its HTML
const createTweetElement = function (tweetObject) {
  let updatedTimeAgo = timeago.format(tweetObject.created_at);
  const element = `
        <article class="tweet">
          <header>
            <div>
            <img src=${tweetObject.user.avatars} />
              <h3>${tweetObject.user.name}</h3>
            </div>
            <h4>${tweetObject.user.handle}</h4>
          </header>
          <p class="tweet-content">${escape(tweetObject.content.text)}</p>
          <footer>
          <span class="need_to_be_rendered" datetime="">${updatedTimeAgo}</span>
              <span>
                <i class="fas fa-flag"></i>
                <i class="fas fa-retweet"></i>
                <i class="fas fa-heart"></i>
                <span>1</span>
              </span>
          </footer>
        </article>
 `;
  return element;
};

const loadTweets = () => {
  $.get("/tweets", { method: "GET" }).then((data) => {
    renderTweets(data);
  });
};

$(document).ready(() => {
  $("#compose").on("submit", function (event) {
    event.preventDefault();
    const tweet = $("#tweet-text").val();
    $("#tweet-text").val("");
    console.log(tweet);
    if (!tweet) {
      $(".error-message").slideDown("slow");
      $(".error-message")
        .children("i")
        .attr("class", "fas fa-exclamation-triangle")
        .text("Your tweet is empty")
        .addClass("red-flag");
      return;
    } else if (tweet.length > 140) {
      $(".error-message").slideDown("slow");
      $(".error-message")
        .children("i")
        .attr("class", "fas fa-exclamation-triangle")
        .text(`Your tweet is longer than 140 characters`)
        .addClass("red-flag");
      return;
    } else {
      $.ajax({
        url: "/tweets",
        method: "POST",
        data: { text: tweet },
      }).then(() => {
        loadTweets();
        $(".error-message").slideUp();
      });
    }
    console.log($(this).serialize());
  });
  loadTweets();
});
