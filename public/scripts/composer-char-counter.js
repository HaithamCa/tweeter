document.addEventListener("DOMContentLoaded", () => {
  const MAX_CHARS = 140;
  const textarea = document.getElementById("tweet-text");
  if (!textarea) return;

  const updateCounter = () => {
    const remaining = MAX_CHARS - textarea.value.length;
    const form = textarea.closest("form");
    const counter = form ? form.querySelector(".counter") : null;
    if (!counter) return;
    counter.textContent = String(remaining);
    counter.classList.toggle("red-flag", remaining < 0);
  };

  textarea.addEventListener("input", updateCounter);
});
