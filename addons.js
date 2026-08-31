LineSledder.addButton({
  id: "saveTrackBtn",
  icon: "↓",
  label: "Save",
  title: "Save track in this browser",
  onClick: LineSledder.saveTrack,
});

LineSledder.addButton({
  id: "loadTrackBtn",
  icon: "↑",
  label: "Load",
  title: "Load the saved track",
  onClick: LineSledder.loadTrack,
});

(() => {
  let recorder = null;
  let recordedChunks = [];
  let recordingStream = null;

  function updateButton(isRecording) {
    const button = document.querySelector("#recordVideoBtn");
    if (!button) return;
    button.classList.toggle("active", isRecording);
    button.querySelector("span").textContent = isRecording ? "■" : "●";
    button.querySelector("small").textContent = isRecording
      ? "Stop"
      : "Record";
  }

  function chooseVideoType() {
    const choices = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return choices.find((type) => MediaRecorder.isTypeSupported(type));
  }

  function startRecording() {
    const canvas = LineSledder.getCanvas();
    const audio = LineSledder.getAudio();

    if (!canvas.captureStream || !window.MediaRecorder) {
      LineSledder.notify("Video recording is not supported in this browser");
      return;
    }

    LineSledder.restart();
    const canvasStream = canvas.captureStream(60);
    const tracks = [...canvasStream.getVideoTracks()];
    const captureAudio = audio.captureStream || audio.mozCaptureStream;

    if (audio.src && captureAudio) {
      try {
        const audioStream = captureAudio.call(audio);
        tracks.push(...audioStream.getAudioTracks());
      } catch {
        LineSledder.notify("Recording video without soundtrack");
      }
    }

    recordingStream = new MediaStream(tracks);
    recordedChunks = [];
    const mimeType = chooseVideoType();
    recorder = new MediaRecorder(
      recordingStream,
      mimeType ? { mimeType } : {},
    );
    const currentRecorder = recorder;

    currentRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    currentRecorder.onstop = () => {
      const finalType = currentRecorder.mimeType || "video/webm";
      const extension = finalType.includes("mp4") ? "mp4" : "webm";
      const videoBlob = new Blob(recordedChunks, { type: finalType });
      const videoURL = URL.createObjectURL(videoBlob);
      const downloadLink = document.createElement("a");

      downloadLink.href = videoURL;
      downloadLink.download = `line-sledder-replay.${extension}`;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      recordingStream.getTracks().forEach((track) => track.stop());
      setTimeout(() => URL.revokeObjectURL(videoURL), 1000);

      recorder = null;
      recordingStream = null;
      recordedChunks = [];
      updateButton(false);
      LineSledder.notify("Replay video exported");
    };

    currentRecorder.start(1000);
    updateButton(true);
    LineSledder.play();
    LineSledder.notify("Recording replay — press Stop when finished");
  }

  function stopRecording() {
    if (!recorder) return;
    LineSledder.pause();
    if (recorder.state !== "inactive") recorder.stop();
  }

  LineSledder.addButton({
    id: "recordVideoBtn",
    icon: "●",
    label: "Record",
    title: "Record and export a replay video",
    onClick: () => recorder ? stopRecording() : startRecording(),
  });
})();

(() => {
  if (document.querySelector("#sledderIntro")) return;
  const shell = document.querySelector(".app-shell");
  const intro = document.createElement("div");
  intro.id = "sledderIntro";
  intro.className = "intro-screen";
  intro.setAttribute("role", "dialog");
  intro.setAttribute("aria-modal", "true");
  intro.setAttribute("aria-label", "Welcome to Line Sledder");
  const strokes = [
    "M 64 114 C 89 82 131 24 115 25 C 92 27 82 79 78 104 C 76 119 64 143 50 137 C 36 129 65 121 83 127 C 100 135 112 136 129 120",
    "M 129 120 C 135 110 142 100 145 98 C 139 111 130 131 140 134 C 149 136 157 122 162 115",
    "M 149 81 L 150 79",
    "M 162 115 L 170 99 L 159 132 C 170 112 183 96 191 100 C 201 106 178 129 190 134 C 200 135 210 123 215 116",
    "M 215 116 C 244 104 234 90 222 102 C 211 113 205 134 221 135 C 232 136 245 126 250 120",
    "M 358 55 C 359 27 320 29 307 51 C 294 74 333 80 344 102 C 363 136 307 151 293 130 C 286 118 294 105 306 102",
    "M 340 127 C 364 109 399 29 388 28 C 372 27 358 104 360 123 C 362 144 377 130 387 116",
    "M 387 116 C 414 104 405 91 394 101 C 380 115 378 134 393 135 C 404 136 415 125 421 117",
    "M 446 105 C 433 88 412 117 419 130 C 428 146 455 108 472 57 C 480 31 469 31 462 48 C 450 76 435 132 445 135 C 454 137 466 122 470 116",
    "M 495 105 C 482 88 461 117 468 130 C 477 146 504 108 521 57 C 529 31 518 31 511 48 C 499 76 484 132 494 135 C 503 137 515 122 519 116",
    "M 519 116 C 546 104 537 91 526 101 C 512 115 510 134 525 135 C 536 136 547 125 553 115",
    "M 553 115 C 565 101 570 89 565 94 C 561 99 567 104 576 102 C 567 116 561 133 574 135 C 588 137 600 126 615 113"
  ];
  intro.innerHTML = '<svg viewBox="25 0 625 185" role="img" aria-label="Line Sledder">' +
    strokes.map(d => '<path d="' + d + '"/>').join("") +
    '</svg><button type="button" disabled>▶ Play</button>';
  document.body.append(intro);
  shell.inert = true;
  LineSledder.pause();
  const button = intro.querySelector("button");
  const paths = [...intro.querySelectorAll("path")];
  paths.forEach(path => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
  });
  button.addEventListener("click", () => {
    shell.inert = false;
    intro.style.opacity = "0";
    intro.style.pointerEvents = "none";
    document.querySelector("#playBtn").focus();
    setTimeout(() => intro.remove(), 300);
  });
  async function writeTitle() {
    await (window.sledderSplashReady || Promise.resolve());
    window.dispatchEvent(new Event("sledder:intro"));
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const path of paths) {
        const length = path.getTotalLength();
        await path.animate(
          [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
          { duration: Math.max(90, length * 3), easing: "linear", fill: "forwards" }
        ).finished;
      }
    } else {
      paths.forEach(path => path.style.strokeDashoffset = 0);
    }
    button.disabled = false;
    button.classList.add("ready");
    button.focus();
  }
  writeTitle();
})();
