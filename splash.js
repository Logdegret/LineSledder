(() => {
  if (window.sledderSplashReady) return;

  window.sledderSplashReady = new Promise((resolve) => {
    const style = document.createElement("style");

    style.textContent = `
      #stardanceSplash {
        position: fixed;
        inset: 0;
        z-index: 20000;
        overflow: hidden;
        background: #0e1645;
        color: white;
        transition: opacity 450ms ease;
      }

      #stardanceSplash .splash-content {
        position: absolute;
        top: 50%;
        left: 0;
        width: 100%;
        transform: translateY(-50%);
      }

      #stardanceSplash .splash-flag {
        display: block;
        width: min(34vw, 560px);
        height: auto;
      }

      #stardanceSplash .splash-sentence {
        margin: -20px 3vw 0 16.5vw;
        min-height: 2.5em;
        color: white;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(22px, 3.25vw, 60px);
        font-weight: bold;
        line-height: 1.3;
      }

      #stardanceSplash .splash-start {
        position: absolute;
        bottom: 9%;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border: 1px solid #ffffff66;
        background: transparent;
        color: white;
        font: 15px Georgia, serif;
        cursor: pointer;
      }

      #stardanceSplash .splash-start:hover {
        background: #ffffff12;
        border-color: white;
      }

      #stardanceSplash .splash-start:focus-visible {
        outline: 2px solid white;
        outline-offset: 5px;
      }

      @media (max-width: 600px) {
        #stardanceSplash .splash-flag {
          width: 70vw;
        }

        #stardanceSplash .splash-sentence {
          margin: 20px 7vw 0;
          min-height: 5em;
          font-size: 26px;
        }
      }
    `;

    document.head.append(style);

    const screen = document.createElement("div");
    screen.id = "stardanceSplash";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("aria-label", "Stardance introduction");

    screen.innerHTML = `
      <div class="splash-content">
        <img
          class="splash-flag"
          src="assets/hack-club-flag.png"
          alt="Hack Club"
        />
        <div class="splash-sentence"></div>
      </div>
      <button class="splash-start" type="button" disabled>
        Click to begin
      </button>
    `;

    document.body.append(screen);

    const image = screen.querySelector("img");
    const sentence = screen.querySelector(".splash-sentence");
    const button = screen.querySelector("button");
    const text =
      "Made for the Stardance summer challenge in 2026";

    sentence.setAttribute("aria-label", text);

    const typedText = document.createElement("span");
    typedText.setAttribute("aria-hidden", "true");
    sentence.append(typedText);

    let audioContext = null;
    let keyboardBuffer = null;
    let started = false;
    let finished = false;
    let timer = 0;

    function prepareAudio() {
      const AudioEngine =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioEngine) return;

      try {
        audioContext = new AudioEngine();
        audioContext.resume().catch(() => {});

        keyboardBuffer = audioContext.createBuffer(
          1,
          Math.ceil(audioContext.sampleRate * 0.04),
          audioContext.sampleRate
        );

        const samples = keyboardBuffer.getChannelData(0);

        for (let i = 0; i < samples.length; i++) {
          const fade = 1 - i / samples.length;
          samples[i] =
            (Math.random() * 2 - 1) * fade * fade * fade;
        }
      } catch {
        audioContext = null;
      }
    }

    function keyboardSound() {
      if (!audioContext || audioContext.state !== "running") {
        return;
      }

      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();

      source.buffer = keyboardBuffer;
      source.playbackRate.value = 0.85 + Math.random() * 0.3;

      filter.type = "bandpass";
      filter.frequency.value = 1400 + Math.random() * 1000;
      filter.Q.value = 0.65;

      gain.gain.value = 0.2;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      source.start();
    }

    function finish() {
      if (finished) return;
      finished = true;

      clearTimeout(timer);
      screen.style.opacity = "0";
      screen.style.pointerEvents = "none";

      setTimeout(() => {
        screen.remove();
        style.remove();

        if (audioContext) {
          audioContext.close().catch(() => {});
        }

        resolve();
      }, 450);
    }

    function begin() {
      if (started) return;
      started = true;

      button.remove();
      prepareAudio();

      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        typedText.textContent = text;
        timer = setTimeout(finish, 1800);
        return;
      }

      let position = 0;

      function typeNext() {
        if (finished) return;

        const character = text[position];
        typedText.textContent += character;
        position++;

        if (character !== " ") keyboardSound();

        if (position < text.length) {
          const delay =
            character === " " ? 90 : 45 + Math.random() * 35;

          timer = setTimeout(typeNext, delay);
        } else {
          timer = setTimeout(finish, 1500);
        }
      }

      timer = setTimeout(typeNext, 350);
    }

    function enableStart() {
      button.disabled = false;
      button.focus();
    }

    button.addEventListener("click", begin);

    image.addEventListener("load", enableStart, { once: true });
    image.addEventListener("error", finish, { once: true });

    if (image.complete) {
      if (image.naturalWidth) {
        enableStart();
      } else {
        finish();
      }
    }
  });
})();