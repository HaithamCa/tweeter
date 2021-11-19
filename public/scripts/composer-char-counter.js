$(document).ready(function () {
  // --- our code goes here ---
  $(".new-tweet").on("keydown", "#tweet-text", function () {
    let $tweetChar = $(this).val().length;
    let $charCounter = 140 - $tweetChar;
    let $updatedCounter = $(".counter").text($charCounter);
    if ($charCounter < 0) {
      $updatedCounter.addClass("red-flag");
    } else {
      $updatedCounter.removeClass("red-flag");
    }
  });
});