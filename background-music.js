(() => {
  const music = new Audio("assets/background-music.mp3");
  music.loop = true;
  music.volume = 0.22;
  music.preload = "auto";
  let enabled = true;
  let started = false;
  let pending = false;
  try {
    enabled = localStorage.getItem("sledderBackgroundMusic") !== "off";
  } catch {}
  const button = document.createElement("button");
  button.type = "button";
  button.hidden = true;
  button.style.cssText = "position:fixed;right:14px;bottom:100px;z-index:10001;padding:8px 12px;border:1px solid #ccc;background:white;color:#333;cursor:pointer;font:12px Arial,sans-serif";
  document.body.append(button);
  function update() {
    button.textContent = !enabled ? "♫ Music off" : music.paused ? "♫ Enable music" : "♫ Music on";
    button.setAttribute("aria-label", music.paused ? "Enable background music" : "Disable background music");
    button.setAttribute("aria-pressed", String(enabled && !music.paused));
  }
  async function tryPlay() {
    if (!started || !enabled || !music.paused || pending) return;
    pending = true;
    try { await music.play(); } catch {} finally {
      pending = false;
      update();
    }
  }
  button.addEventListener("click", () => {
    if (enabled && !music.paused) {
      enabled = false;
      music.pause();
    } else {
      enabled = true;
      tryPlay();
    }
    try { localStorage.setItem("sledderBackgroundMusic", enabled ? "on" : "off"); } catch {}
    update();
  });
  document.addEventListener("pointerdown", event => {
    if (event.target !== button) tryPlay();
  });
  document.addEventListener("keydown", event => {
    if (event.target !== button) tryPlay();
  });
  window.addEventListener("sledder:intro", () => {
    started = true;
    button.hidden = false;
    update();
    tryPlay();
  }, { once: true });
  music.addEventListener("error", () => {
    button.textContent = "Music unavailable";
    button.disabled = true;
  });
})();
