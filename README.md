# Line Sledder

Line Sledder is a browser game where you draw a track and watch a sledder ride it. 🛷❄️

It was inspired by Line Rider and is made with HTML, CSS, and JavaScript.

## About

Draw lines, make jumps, add speed or bounce sections, and press play to see what happens.

Everything runs in your browser, so there is no complicated setup.

## Features

### Track Editor

- Draw curves and straight lines
- Use regular, speed, or bounce lines
- Hold **Shift** to change which side of the line is rideable
- Erase and edit lines
- Undo and redo
- Pan and zoom around the map
- Edit the track while the simulation is paused

### Sledders

- Gravity-based movement
- Sledders can jump, crash, and fall apart
- Up to four sledders
- Choose where each sledder starts
- Camera follow mode
- Play, pause, restart, rewind, and fast-forward
- Use the timeline to move through the ride

### Music and Extras

- Upload your own song and play it with the ride
- Optional background music
- Record your ride as a video
- Snow/Christmas mode
- Intro screen
- Save and load tracks in your browser

## Tech Stack

| Part | Technology |
| --- | --- |
| Website | HTML |
| Styling | CSS |
| Game | JavaScript |
| Drawing | Canvas |
| Audio | HTML Audio |
| Saving | localStorage |
| Recording | MediaRecorder |

## Files

```text
├── index.html
├── style.css
├── main.js
├── addons.js
├── splash.js
├── background-music.js
├── assets/
└── README.md
```

## Getting Started

Clone the project:

```sh
git clone https://github.com/Logdegret/LineSledder.git
cd LineSledder
```

Then open `index.html` in your browser.

You can also run a local server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then go to:

```text
http://localhost:8080
```

## How to Play

1. Choose **Curve** or **Line**.
2. Pick **Regular**, **Speed**, or **Bounce**.
3. Draw a track under the sledder.
4. Press **Play**.
5. Pause and edit your track if needed.
6. Save it from **☰ Settings → Save**.

Saved tracks are stored only in your browser. They do not sync to GitHub or other devices.

Uploaded songs need to be selected again after refreshing the page.

## Deployment

Line Sledder is a static website, so it does not need a server or build system.

You can host it on GitHub Pages or any other static website host.

---

**Line Sledder — draw a line, take a ride. 🛷❄️**
