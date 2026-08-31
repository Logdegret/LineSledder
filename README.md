# Line Sledder

A browser-based sledding game where you draw the track and let gravity do the rest 🛷❄️

Built with HTML, CSS, and JavaScript

## About

Line Sledder is a fully client-side track editor and sledding simulation inspired by the core mechanics of Line Rider. Draw curves, build jumps, add speed and bounce lines, and watch your sledders ride what you create.

Everything runs in your browser with plain HTML, CSS, and JavaScript. No backend, no database, and no build step required.

## Features

### Track Editor

- **Curves and straight lines** — draw smooth freehand tracks or use the separate straight-line tool
- **Three track types** — regular, speed, and bounce
- **Line direction** — hold Shift while drawing to reverse the rideable side; the black edge shows which side is solid
- **Editing tools** — erase, select, and edit lines, with undo and redo
- **Pan and zoom** — move around an open canvas and work at different scales
- **Live recalculation** — editing a track updates the sledders to where they would be at the current simulation time

### Sledders and Playback

- **Gravity-based simulation** — sledders slide, jump, and react to track impacts
- **Joined characters** — the rider's body reacts to motion and can detach after a hard impact
- **Up to four sledders** — choose the rider count in Settings
- **Custom starting positions** — place each sledder's start on the map
- **Camera follow** — follow the lead sledder during playback
- **Timeline controls** — play, pause, restart, and scrub through the simulation
- **Hold-to-speed controls** — hold the forward button for fast playback or the back button to rewind
- **Restart without clearing** — reset the ride while keeping your track

### Music and Extras

| Feature | Description |
| --- | --- |
| Local soundtrack | Choose an audio file and synchronize it with simulation playback and seeking |
| Background music | Looping background music with a separate on/off control |
| Replay recording | Record the canvas and download a video; format and soundtrack capture depend on browser support |
| Snowy / Christmas mode | Optional falling snow and festive colors, without changing the physics |
| Intro screen | Animated introduction before entering the editor |
| Save and load | Store the track, rider count, and starting positions in this browser |

### Simple Add-ons

Extra buttons can use the `LineSledder` API exposed by `main.js`. The existing save, load, and recording controls live in `addons.js`.

You can add a button without editing the HTML or manually connecting its click handler.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3 |
| Logic | Vanilla JavaScript |
| Rendering | Canvas 2D |
| Audio | HTML audio elements |
| Storage | Browser localStorage |
| Video recording | Canvas captureStream and MediaRecorder |

## Architecture

```text
├── index.html             # Editor, toolbar, sidebar, and timeline
├── style.css              # Layout, controls, and seasonal styling
├── main.js                # Drawing, physics, playback, riders, and saving
├── addons.js              # Save/load buttons and replay recording
├── splash.js              # Intro screen
├── background-music.js    # Looping music and its toggle
├── assets/
│   ├── background-music.mp3
│   ├── hack-club-flag.png
│   └── stardance-splash.png
└── README.md
```

## Getting Started

Clone the repository:

```sh
git clone https://github.com/Logdegret/LineSledder.git
cd LineSledder
```

Open `index.html` in your browser, or run a local static server with Python:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open [localhost:8080](http://localhost:8080).

### Your First Track

1. Select **Curve** or **Line**.
2. Choose **Regular**, **Speed**, or **Bounce** from the drawing options.
3. Draw a track underneath the sledder's starting position.
4. Press **Play** to try it.
5. Pause and edit, or use the timeline to inspect the ride.
6. Open **☰ Settings → Save** to keep your track in this browser.

Saved tracks belong to the browser and site address you used. They do not sync to GitHub or other devices, and clearing browser storage removes them. Uploaded songs must be selected again after a reload. Browsers may require a click before allowing sound to play.

## Deployment

Line Sledder is a static site. Publish the project files together, keeping the `assets` folder and its paths intact.

It can be hosted with GitHub Pages or another static host. No server-side application or build command is needed.


---

Line Sledder — draw a line, take a ride 🛷❄️
