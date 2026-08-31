(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const canvas = $("#stage"),
    ctx = canvas.getContext("2d"),
    audio = $("#audio");
  const state = {
    lines: [],
    history: [],
    future: [],
    tool: "draw",
    lineType: "regular",
    width: 3,
    camera: { x: 0, y: 0, zoom: 1 },
    pointer: null,
    hoverPoint: null,
    draft: null,
    selected: -1,
    running: false,
    simTime: 0,
    winterMode: false,
    speed: 1,
    rider: null,
    lastFrame: 0,
    accumulator: 0,
    follow: true,
    audioUrl: null,
  };
  const riderStart = { x: 130, y: 110 };
  function defaultSpawnPoints() {
    return Array.from({ length: 4 }, (_, i) => ({
      x: riderStart.x - i * 36,
      y: riderStart.y - i * 14,
    }));
  }
  state.spawnPoints = defaultSpawnPoints();
  state.spawnIndex = null;
  const FIXED_DT = 1 / 120, GRAVITY = 980;
  const SLED_CONTACT_OFFSET = 12;
  const SLED_CONTACT_RADIUS = 4;
  let pendingTrackPreview = 0;
  const BOOST_ACCELERATION = 2300;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const snowflakes = Array.from({ length: 65 }, (_, i) => ({
    x: ((i * 47) % 101) / 101,
    y: ((i * 31) % 97) / 97,
    radius: 1 + (i % 3) * 0.6,
    speed: 12 + (i % 7) * 4,
  }));
  try {
    state.winterMode = localStorage.getItem("line-sledder-winter") === "true";
  } catch {}
  document.body.classList.toggle("winter-mode", state.winterMode);
  $("#winterMode").checked = state.winterMode;
  $("#winterMode").onchange = (event) => {
    state.winterMode = event.target.checked;
    document.body.classList.toggle("winter-mode", state.winterMode);
    try {
      localStorage.setItem("line-sledder-winter", String(state.winterMode));
    } catch {}
    draw();
  };

  function resize() {
    const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    draw();
  }
  const view = (p) => ({
    x: (p.x - state.camera.x) * state.camera.zoom,
    y: (p.y - state.camera.y) * state.camera.zoom,
  });
  const world = (p) => ({
    x: p.x / state.camera.zoom + state.camera.x,
    y: p.y / state.camera.zoom + state.camera.y,
  });
  const eventPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function resetRider() {
    state.rider = {
      x: riderStart.x,
      y: riderStart.y,
      vx: 95,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
      previousX: riderStart.x,
      previousY: riderStart.y,
      previousAngle: 0,
      grounded: false,
      gForce: 0,
      detached: false,
      bodyX: riderStart.x,
      bodyY: riderStart.y,
      bodyVx: 0,
      bodyVy: 0,
      bodyAngle: 0,
      bodyAngularVelocity: 0,
      previousBodyX: riderStart.x,
      previousBodyY: riderStart.y,
      previousBodyAngle: 0,
      pose: { air: 1, spin: 0, compression: 0, lean: 95 / 700 * 4, crouch: 0 },
      previousPose: { air: 1, spin: 0, compression: 0, lean: 95 / 700 * 4, crouch: 0 },
    };
  }
  function snap(p, anchor) {
    if (!anchor) return p;
    const a = Math.atan2(p.y - anchor.y, p.x - anchor.x),
      step = Math.PI / 12,
      sa = Math.round(a / step) * step,
      d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
    return { x: anchor.x + Math.cos(sa) * d, y: anchor.y + Math.sin(sa) * d };
  }

  function save() {
    state.history.push(JSON.stringify(state.lines));
    if (state.history.length > 80) state.history.shift();
    state.future = [];
    updateStats();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push(JSON.stringify(state.lines));
    state.lines = JSON.parse(state.history.pop());
    state.selected = -1;
    updateStats();
    rebuildPausedSimulation();
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(JSON.stringify(state.lines));
    state.lines = JSON.parse(state.future.pop());
    state.selected = -1;
    updateStats();
    rebuildPausedSimulation();
  }
  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    if (!l) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function hitLine(p) {
    let best = -1, dist = 10 / state.camera.zoom;
    state.lines.forEach((l, i) => {
      const d = distanceToSegment(p, l.a, l.b);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }

  function smoothStroke(segments) {
    if (segments.length < 2) return segments;

    const points = [segments[0].a, ...segments.map((segment) => segment.b)];
    const smoothPoints = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];

      smoothPoints.push({
        x: current.x * .75 + next.x * .25,
        y: current.y * .75 + next.y * .25,
      });
      smoothPoints.push({
        x: current.x * .25 + next.x * .75,
        y: current.y * .25 + next.y * .75,
      });
    }

    smoothPoints.push(points.at(-1));

    return smoothPoints.slice(0, -1).map((point, index) => ({
      a: point,
      b: smoothPoints[index + 1],
      type: segments[0].type,
      width: segments[0].width,
      side: segments[0].side || 1,
    }));
  }

  function drawLine(l, i) {
    const a = view(l.a), b = view(l.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = (l.width || 3) * state.camera.zoom;
    ctx.strokeStyle = l.type === "boost"
      ? "#2780cf"
      : l.type === "bounce"
      ? "#d5488f"
      : "#666";
    ctx.setLineDash(
      l.type === "bounce" ? [9 * state.camera.zoom, 4 * state.camera.zoom] : [],
    );
    ctx.stroke();
    ctx.setLineDash([]);

    const edgeDx = b.x - a.x;
    const edgeDy = b.y - a.y;
    const edgeLength = Math.hypot(edgeDx, edgeDy);
    if (edgeLength > 0) {
      const edgeOffset = ((l.width || 3) * .55 + .75) * state.camera.zoom;
      const side = l.side || 1;
      const normalX = edgeDy / edgeLength * side;
      const normalY = -edgeDx / edgeLength * side;

      ctx.beginPath();
      ctx.moveTo(a.x + normalX * edgeOffset, a.y + normalY * edgeOffset);
      ctx.lineTo(b.x + normalX * edgeOffset, b.y + normalY * edgeOffset);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = Math.max(2.25, 2.25 * state.camera.zoom);
      ctx.stroke();
    }

    if (l.type === "boost") {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len > 45) {
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2,
          tx = dx / len,
          ty = dy / len;
        ctx.beginPath();
        ctx.moveTo(mx - tx * 7 + ty * 4, my - ty * 7 - tx * 4);
        ctx.lineTo(mx, my);
        ctx.lineTo(mx - tx * 7 - ty * 4, my - ty * 7 + tx * 4);
        ctx.strokeStyle = "#2780cf";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (i === state.selected) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#2674c8";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      [a, b].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "#2674c8";
        ctx.stroke();
      });
    }
  }
  function getRenderedRider() {
    const rider = state.rider;
    const alpha = state.running ? Math.max(0, Math.min(1, state.accumulator / FIXED_DT)) : 1;
    const angleDifference = Math.atan2(
      Math.sin(rider.angle - rider.previousAngle),
      Math.cos(rider.angle - rider.previousAngle),
    );

    const pose = {};
    for (const key of Object.keys(rider.pose)) {
      pose[key] = rider.previousPose[key] +
        (rider.pose[key] - rider.previousPose[key]) * alpha;
    }
    return {
      pose,
      bodyX: rider.previousBodyX + (rider.bodyX - rider.previousBodyX) * alpha,
      bodyY: rider.previousBodyY + (rider.bodyY - rider.previousBodyY) * alpha,
      bodyAngle: rider.previousBodyAngle + (rider.bodyAngle - rider.previousBodyAngle) * alpha,
      x: rider.previousX + (rider.x - rider.previousX) * alpha,
      y: rider.previousY + (rider.y - rider.previousY) * alpha,
      angle: rider.previousAngle + angleDifference * alpha,
    };
  }

  function drawLimb(a, b, width = 3) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawJoint(point, radius = 2.2) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#202428";
    ctx.fill();
  }

  function drawRider() {
    const rendered = getRenderedRider();
    const physicsRider = state.rider;
    const p = view(rendered);
    const bodyPoint = physicsRider.detached
      ? view({ x: rendered.bodyX, y: rendered.bodyY })
      : p;
    const bodyAngle = physicsRider.detached
      ? rendered.bodyAngle
      : rendered.angle;
    const s = state.camera.zoom;
    const speed = Math.hypot(physicsRider.vx, physicsRider.vy);
    const speedLean = rendered.pose.lean;
    const airborne = rendered.pose.air;
    const rotationLag = rendered.pose.spin;
    const gCompression = rendered.pose.compression;
    const airSwing = -rotationLag * .24 * airborne;
    const crouch = rendered.pose.crouch;

    const hip = { x: -3 - rotationLag * .12, y: -2 + crouch * .55 };
    const shoulder = {
      x: 1 + speedLean - rotationLag * .9,
      y: -16 + crouch,
    };
    const head = {
      x: 2 + speedLean - rotationLag * 1.5,
      y: -25 + crouch * 1.35 + Math.abs(rotationLag) * .2,
    };
    const frontHand = {
      x: 14 - rotationLag * .15,
      y: -8 + gCompression * .35,
    };
    const backHand = {
      x: 9 - rotationLag * .45,
      y: -10 + crouch * .65,
    };
    const frontKnee = {
      x: 8 + airSwing * 2.8 + rotationLag * .45,
      y: 4 - airborne * 3 + gCompression * .55,
    };
    const backKnee = {
      x: -8 - airSwing * 2.8 - rotationLag * .5,
      y: 3 + airborne * 2 + gCompression * .5,
    };
    const frontFoot = {
      x: 15 + airSwing * 1.8 + rotationLag * .3,
      y: 9 - airborne * 4,
    };
    const backFoot = {
      x: -13 - airSwing * 1.8 - rotationLag * .35,
      y: 9 + airborne * 4,
    };

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rendered.angle);
    ctx.scale(s, s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#202428";

    ctx.beginPath();
    ctx.moveTo(-21, 12);
    ctx.quadraticCurveTo(0, 17, 22, 10);
    ctx.bezierCurveTo(29, 7, 27, 0, 23, 3);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#c5b7a0";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.strokeStyle = "#292624";
    drawLimb({ x: -12, y: 7 }, { x: -16, y: 12 }, 2.5);
    drawLimb({ x: 14, y: 6 }, { x: 19, y: 11 }, 2.5);
    ctx.beginPath();
    ctx.moveTo(-18, 5);
    ctx.lineTo(19, 4);
    ctx.lineTo(20, 8);
    ctx.lineTo(-18, 9);
    ctx.closePath();
    ctx.fillStyle = "#bf8753";
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = "#805534";
    drawLimb({ x: -12, y: 7 }, { x: 12, y: 6 }, .7);

    ctx.restore();

    ctx.save();
    ctx.translate(bodyPoint.x, bodyPoint.y);
    ctx.rotate(bodyAngle);
    ctx.scale(s, s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#202428";

    const ink = "#292624";
    function cloth(points, color, width) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
      ctx.strokeStyle = ink;
      ctx.lineWidth = width + 2;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    function boot(foot) {
      ctx.beginPath();
      ctx.moveTo(foot.x - 3, foot.y - 6);
      ctx.lineTo(foot.x + 1, foot.y - 6);
      ctx.lineTo(foot.x + 2, foot.y - 2);
      ctx.quadraticCurveTo(foot.x + 8, foot.y - 2, foot.x + 7, foot.y + 1);
      ctx.lineTo(foot.x - 4, foot.y + 1);
      ctx.closePath();
      ctx.fillStyle = "#65554a";
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    cloth([hip, backKnee, backFoot], "#5d6c70", 4.5);
    boot(backFoot);
    cloth([hip, frontKnee, frontFoot], "#829399", 5);
    boot(frontFoot);

    ctx.beginPath();
    ctx.moveTo(shoulder.x - 4, shoulder.y - 1);
    ctx.quadraticCurveTo(shoulder.x - 8, shoulder.y + 5, hip.x - 6, hip.y + 2);
    ctx.quadraticCurveTo(hip.x, hip.y + 5, hip.x + 5, hip.y + 1);
    ctx.lineTo(shoulder.x + 5, shoulder.y + 2);
    ctx.closePath();
    ctx.fillStyle = "#c74f42";
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    drawLimb({ x: shoulder.x + 1, y: shoulder.y + 3 }, { x: hip.x + 2, y: hip.y }, .8);
    cloth([shoulder, backHand, frontHand], "#df6851", 4);
    if (!physicsRider.detached) {
      ctx.strokeStyle = "#76614b";
      drawLimb({ x: 20, y: 5 }, frontHand, 1.2);
    }
    ctx.beginPath();
    ctx.ellipse(frontHand.x + 1, frontHand.y, 3.5, 2.7, -.4, 0, Math.PI * 2);
    ctx.fillStyle = "#e1bd78";
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(head.x - 5, head.y - 4);
    ctx.bezierCurveTo(head.x + 3, head.y - 9, head.x + 8, head.y - 3, head.x + 7, head.y);
    ctx.lineTo(head.x + 10, head.y + 2);
    ctx.lineTo(head.x + 7, head.y + 3);
    ctx.quadraticCurveTo(head.x + 6, head.y + 9, head.x - 3, head.y + 6);
    ctx.closePath();
    ctx.fillStyle = "#f0d4b4";
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x + 5, head.y, .85, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(head.x + 3, head.y + 5);
    ctx.quadraticCurveTo(head.x + 5, head.y + 6, head.x + 6, head.y + 4);
    ctx.lineWidth = .8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.x - 7, head.y - 1);
    ctx.bezierCurveTo(head.x - 9, head.y - 13, head.x + 5, head.y - 14, head.x + 8, head.y - 4);
    ctx.lineTo(head.x + 8, head.y - 1);
    ctx.quadraticCurveTo(head.x, head.y - 4, head.x - 7, head.y - 1);
    ctx.fillStyle = "#c74f42";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    cloth([{ x: head.x - 7, y: head.y - 1 }, { x: head.x + 7, y: head.y - 2 }], "#e1bd78", 2.3);
    ctx.beginPath();
    ctx.arc(head.x - 2, head.y - 12, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = "#e1bd78";
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const scarfLift = Math.min(Math.abs(physicsRider.vy) / 250, 5);
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 2, shoulder.y - 3);
    ctx.quadraticCurveTo(
      shoulder.x - 10,
      shoulder.y - 5 - scarfLift,
      shoulder.x - 18 - speedLean,
      shoulder.y - 2 - scarfLift,
    );
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = "#e1bd78";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  }
  function drawSnow(width, height) {
    const time = reducedMotion.matches ? 0 : performance.now() / 1000;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#afc7d0";
    ctx.lineWidth = 0.6;
    snowflakes.forEach((flake, i) => {
      const x = (flake.x * width + Math.sin(time * 0.35 + i) * 12 + width) % width;
      const y = (flake.y * height + time * flake.speed) % height;
      ctx.beginPath();
      ctx.arc(x, y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }
  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.fillStyle = state.winterMode ? "#edf5f7" : "#fff";
    ctx.fillRect(0, 0, r.width, r.height);
    if (state.winterMode && r.width && r.height) drawSnow(r.width, r.height);
    state.lines.forEach(drawLine);
    if (state.draft) state.draft.forEach((l) => drawLine(l, -1));
    drawStart();
    drawRider();
  }
  function drawStart() {
    ctx.save();
    const points = state.spawnPoints.slice(0, state.riderCount || 1);
    points.forEach((point, index) => {
    const p = view(point);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 45);
    ctx.lineTo(p.x, p.y + 35);
    ctx.strokeStyle = "rgba(255,74,61,.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff4a3d";
    ctx.font = "800 9px Inter,sans-serif";
    ctx.fillText("START " + (index + 1), p.x - 20, p.y - 51);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    });
    ctx.restore();
  }

  function simulate(dt, lines = state.lines) {
    const rider = state.rider;
    let strongestGForce = 0;
    let strongestImpactSpeed = 0;
    const wasGrounded = rider.grounded;
    rider.pose ||= { air: 1, spin: 0, compression: 0, lean: 0, crouch: 0 };
    rider.previousPose = { ...rider.pose };
    rider.previousBodyX = rider.bodyX;
    rider.previousBodyY = rider.bodyY;
    rider.previousBodyAngle = rider.bodyAngle;

    rider.previousX = rider.x;
    rider.previousY = rider.y;
    rider.previousAngle = rider.angle;

    rider.vy += GRAVITY * dt;
    rider.x += rider.vx * dt;
    rider.y += rider.vy * dt;
    rider.angle += rider.angularVelocity * dt;
    rider.angularVelocity *= .9995;
    rider.grounded = false;

    for (let pass = 0; pass < 2; pass++) {
      const contactOffsetX = -Math.sin(rider.angle) * SLED_CONTACT_OFFSET;
      const contactOffsetY = Math.cos(rider.angle) * SLED_CONTACT_OFFSET;
      const contactX = rider.x + contactOffsetX;
      const contactY = rider.y + contactOffsetY;

      const contactVelocityX = rider.vx -
        rider.angularVelocity * contactOffsetY;
      const contactVelocityY = rider.vy +
        rider.angularVelocity * contactOffsetX;

      let collision = null;

      for (const line of lines) {
        const dx = line.b.x - line.a.x;
        const dy = line.b.y - line.a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1) continue;

        const length = Math.sqrt(lengthSquared);
        const side = line.side || 1;
        const normalX = dy / length * side;
        const normalY = -dx / length * side;
        const linePosition = ((contactX - line.a.x) * dx +
          (contactY - line.a.y) * dy) / lengthSquared;

        if (linePosition < 0 || linePosition > 1) continue;

        const distance = (contactX - line.a.x) * normalX +
          (contactY - line.a.y) * normalY;
        const normalSpeed = line.type === "bounce"
          ? contactVelocityX * normalX + contactVelocityY * normalY
          : rider.vx * normalX + rider.vy * normalY;

        const restingContact = wasGrounded && line.type !== "bounce" &&
          distance <= SLED_CONTACT_RADIUS + .3 && normalSpeed <= 1;
        const touchesSurface = distance > -SLED_CONTACT_RADIUS &&
          ((distance <= SLED_CONTACT_RADIUS && normalSpeed < 0) || restingContact);

        if (touchesSurface && (!collision || distance < collision.distance)) {
          collision = {
            line,
            dx,
            dy,
            length,
            normalX,
            normalY,
            normalSpeed,
            distance,
          };
        }
      }

      if (!collision) break;

      const correction = SLED_CONTACT_RADIUS - collision.distance;
      rider.x += collision.normalX * correction;
      rider.y += collision.normalY * correction;

      const tangentX = collision.dx / collision.length;
      const tangentY = collision.dy / collision.length;

      const bounce = collision.line.type === "bounce" ? .82 : 0;
      if (collision.line.type !== "bounce") {
        strongestImpactSpeed = Math.max(
          strongestImpactSpeed,
          -collision.normalSpeed,
        );
      }
      const collisionImpulse = Math.max(0, -(1 + bounce) * collision.normalSpeed);
      strongestGForce = Math.max(
        strongestGForce,
        collisionImpulse / (GRAVITY * dt),
      );
      const impulseX = collisionImpulse * collision.normalX;
      const impulseY = collisionImpulse * collision.normalY;

      rider.vx += impulseX;
      rider.vy += impulseY;

      const torque = contactOffsetX * impulseY - contactOffsetY * impulseX;

      if (collision.line.type === "bounce") {
        rider.angularVelocity += torque * .0001;
        rider.angularVelocity *= .35;
      }

      if (collision.line.type !== "bounce") {
        rider.vx *= .998;
        rider.vy *= .998;
      }

      if (collision.line.type === "boost") {
        rider.vx += tangentX * BOOST_ACCELERATION * dt;
        rider.vy += tangentY * BOOST_ACCELERATION * dt;
      }

      if (collision.line.type === "bounce") break;

      const trackAngle = Math.atan2(collision.normalX, -collision.normalY);
      const angleError = Math.atan2(
        Math.sin(trackAngle - rider.angle),
        Math.cos(trackAngle - rider.angle),
      );
      rider.angle += angleError;
      rider.x += contactOffsetX + Math.sin(rider.angle) * SLED_CONTACT_OFFSET;
      rider.y += contactOffsetY - Math.cos(rider.angle) * SLED_CONTACT_OFFSET;
      const supportTurn = Math.atan2(
        Math.sin(rider.angle - rider.previousAngle),
        Math.cos(rider.angle - rider.previousAngle),
      );
      rider.angularVelocity = wasGrounded
        ? Math.max(-6, Math.min(6, supportTurn / dt))
        : 0;
      rider.grounded = true;
      break;
    }

    const visibleGForce = Math.min(strongestGForce, 5);
    const gSmoothing = visibleGForce > rider.gForce ? .62 : .035;
    rider.gForce += (visibleGForce - rider.gForce) * gSmoothing;

    if (
      !rider.detached &&
      (
        strongestImpactSpeed > 720 ||
        (
          strongestImpactSpeed > 480 &&
          Math.abs(rider.angularVelocity) > 5.9
        )
      )
    ) {
      rider.detached = true;
      const bodyOffsetX = Math.sin(rider.angle) * 12;
      const bodyOffsetY = -Math.cos(rider.angle) * 12;
      rider.bodyX = rider.x + bodyOffsetX;
      rider.bodyY = rider.y + bodyOffsetY;
      rider.bodyVx = rider.vx + bodyOffsetX * 5;
      rider.bodyVy = rider.vy + bodyOffsetY * 5;
      rider.bodyAngle = rider.angle;
      rider.bodyAngularVelocity = rider.angularVelocity * 1.4;
      rider.previousBodyX = rider.bodyX;
      rider.previousBodyY = rider.bodyY;
      rider.previousBodyAngle = rider.bodyAngle;
    }

    if (rider.detached) {
      rider.bodyVy += GRAVITY * dt;
      rider.bodyX += rider.bodyVx * dt;
      rider.bodyY += rider.bodyVy * dt;
      rider.bodyAngle += rider.bodyAngularVelocity * dt;
      rider.bodyAngularVelocity *= .998;
    }
    const speed = Math.hypot(rider.vx, rider.vy);
    const air = rider.detached || !rider.grounded ? 1 : 0;
    const compression = Math.min(9, Math.max(0, rider.gForce - 1.15) * 2.5);
    const targets = {
      air,
      spin: Math.max(-8, Math.min(8,
        (rider.detached ? rider.bodyAngularVelocity : rider.angularVelocity) * 2.5)),
      compression,
      lean: Math.min(speed / 700, 1) * 4,
      crouch: (1 - air) * (Math.min(speed / 900, 1) * 3 + compression),
    };
    for (const key of Object.keys(targets)) {
      const response = 1 - Math.exp(-dt * (key === "compression" ? 16 : 10));
      rider.pose[key] += (targets[key] - rider.pose[key]) * response;
    }
  }
  function tick(t) {
    const elapsed = Math.min(.05, (t - state.lastFrame) / 1000 || 0);
    state.lastFrame = t;
    if (heldSpeed?.rewind) {
      heldSpeed.elapsed += elapsed;
      if (heldSpeed.elapsed >= 1 / 30) {
        const target = Math.max(0, state.simTime - heldSpeed.elapsed * heldSpeed.rate);
        heldSpeed.elapsed = 0;
        if (target !== state.simTime) seekSimulation(target);
      }
    } else if (state.running) {
      const scaled = elapsed * state.speed;
      state.simTime += scaled;
      state.accumulator += scaled;
      while (state.accumulator >= FIXED_DT) {
        simulate(FIXED_DT);
        state.accumulator -= FIXED_DT;
      }
      syncAudio(false);
      if (state.follow) {
        const renderedRider = getRenderedRider();
        const visibleWidth = canvas.clientWidth / state.camera.zoom;
        const visibleHeight = canvas.clientHeight / state.camera.zoom;
        const targetX = renderedRider.x - visibleWidth * .4;
        const targetY = renderedRider.y - visibleHeight * .45;

        const followAmount = 1 - Math.exp(-elapsed * 12);
        state.camera.x += (targetX - state.camera.x) * followAmount;
        state.camera.y += (targetY - state.camera.y) * followAmount;
      }
    }
    updateTime();
    draw();
    requestAnimationFrame(tick);
  }
  function play() {
    if (state.running) return;
    if (pendingTrackPreview) rebuildPausedSimulation();
    state.running = true;
    state.lastFrame = performance.now();
    $("#pauseBtn").classList.remove("playing");
    $("#playBtn").classList.add("playing");
    $("#playBtn").ariaLabel = "Play";
    syncAudio(true);
  }
  function pause() {
    state.running = false;
    $("#pauseBtn").classList.add("playing");
    $("#playBtn").classList.remove("playing");
    $("#playBtn").ariaLabel = "Play";
    audio.pause();
  }
  function restart() {
    endSpeedHold();
    clearTimeout(pendingTrackPreview);
    pendingTrackPreview = 0;
    pause();
    state.simTime = 0;
    state.accumulator = 0;
    state.camera = { x: 0, y: 0, zoom: 1 };
    resetRider();
    if (audio.src) audio.currentTime = 0;
    $("#zoomReadout").textContent = "100%";
    draw();
    updateTime();
  }

  function centerCameraOnRider() {
    if (!state.follow) return;

    const visibleWidth = canvas.clientWidth / state.camera.zoom;
    const visibleHeight = canvas.clientHeight / state.camera.zoom;
    state.camera.x = state.rider.x - visibleWidth * .4;
    state.camera.y = state.rider.y - visibleHeight * .45;
  }

  function seekSimulation(targetTime, { keepCamera = false, lines = state.lines } = {}) {
    pause();

    const safeTime = Math.max(0, targetTime);
    resetRider();
    state.simTime = 0;
    state.accumulator = 0;

    const fullSteps = Math.floor(safeTime / FIXED_DT);
    for (let step = 0; step < fullSteps; step++) {
      simulate(FIXED_DT, lines);
    }

    const remainder = safeTime - fullSteps * FIXED_DT;
    if (remainder > 0) simulate(remainder, lines);

    state.simTime = safeTime;
    state.rider.previousX = state.rider.x;
    state.rider.previousY = state.rider.y;
    state.rider.previousAngle = state.rider.angle;

    if (audio.src) {
      audio.currentTime = Math.min(safeTime, audio.duration || safeTime);
    }

    if (!keepCamera) centerCameraOnRider();
    updateTime();
    draw();
  }

  function rebuildPausedSimulation() {
    clearTimeout(pendingTrackPreview);
    pendingTrackPreview = 0;
    if (!state.running && state.simTime > 0) {
      const draft = state.draft
        ? (state.tool === "straight" ? state.draft : smoothStroke(state.draft))
        : [];
      seekSimulation(state.simTime, {
        keepCamera: true,
        lines: draft.length ? [...state.lines, ...draft] : state.lines,
      });
    } else {
      draw();
    }
  }
  function queueTrackPreview() {
    if (pendingTrackPreview || state.running || state.simTime === 0) return;
    pendingTrackPreview = setTimeout(rebuildPausedSimulation, 70);
  }
  function syncAudio(force) {
    if (!audio.src) return;
    const target = Math.min(state.simTime, audio.duration || state.simTime);
    if (force || Math.abs(audio.currentTime - target) > .18) {
      audio.currentTime = target;
    }
    if (state.running && audio.paused) {
      audio.play().catch(() => toast("Press play again to start audio"));
    }
  }
  function updateTime() {
    const m = Math.floor(state.simTime / 60),
      s = Math.floor(state.simTime % 60),
      cs = Math.floor((state.simTime % 1) * 100);
    $("#timeReadout").textContent = `${String(m).padStart(2, "0")}:${
      String(s).padStart(2, "0")
    }.${String(cs).padStart(2, "0")}`;

    const slider = $("#timeSlider");
    const neededMaximum = Math.max(
      30,
      Math.ceil(state.simTime + 10),
      Number.isFinite(audio.duration) ? Math.ceil(audio.duration) : 0,
    );
    slider.max = neededMaximum;
    $("#endTimeReadout").textContent = `${String(Math.floor(neededMaximum / 60)).padStart(2, "0")}:${String(neededMaximum % 60).padStart(2, "0")}.00`;
    if (!timelineDragging) slider.value = state.simTime;
  }
  function updateStats() {
    let len = 0;
    state.lines.forEach((l) => {
      len += Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
    });
    $("#lineCount").textContent = state.lines.length;
    $("#trackLength").textContent = Math.round(len);
  }
  function setTool(tool) {
    state.tool = tool;
    if (tool !== "spawn") state.spawnIndex = null;
    $("#lineType").hidden = tool !== "draw" && tool !== "straight";
    updateEraserOutline();
    document.querySelectorAll(".tool[data-tool]").forEach((b) =>
      b.classList.toggle("active", b.dataset.tool === tool)
    );
    canvas.style.cursor = tool === "pan"
      ? "grab"
      : tool === "erase"
      ? "none"
      : tool === "select"
      ? "default"
      : "crosshair";
    if ($("#toolHint")) $("#toolHint").textContent = {
      draw: "DRAG FOR A CURVE · HOLD SHIFT FOR OPPOSITE SIDE",
      straight: "DRAG A STRAIGHT LINE · HOLD SHIFT FOR OPPOSITE SIDE",
      select: "CLICK A LINE · DRAG TO MOVE",
      erase: "CLICK OR DRAG TO ERASE",
      pan: "DRAG TO PAN · WHEEL TO ZOOM",
    }[tool];
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.tool === "spawn" && e.button === 0 && state.spawnIndex !== null) {
      const point = world(eventPoint(e));
      const index = state.spawnIndex;
      state.spawnPoints[index] = { x: point.x, y: point.y };
      endSpeedHold();
      seekSimulation(state.simTime, { keepCamera: true });
      setTool("draw");
      updateSpawnControls();
      toast("Sledder " + (index + 1) + " start placed");
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const sp = eventPoint(e), p = world(sp);
    state.pointer = {
      start: p,
      last: p,
      drawLast: p,
      screen: sp,
      button: e.button,
      moved: false,
      side: e.shiftKey ? -1 : 1,
    };
    if (e.button === 1 || state.tool === "pan") {
      canvas.style.cursor = "grabbing";
      return;
    }
    if (state.running) pause();
    if (state.tool === "draw" || state.tool === "straight") {
      save();
      state.draft = [];
    } else if (state.tool === "erase") {
      const i = hitLine(p);
      if (i >= 0) {
        save();
        state.lines.splice(i, 1);
        state.pointer.trackChanged = true;
        updateStats();
        queueTrackPreview();
      }
    } else if (state.tool === "select") {
      state.selected = hitLine(p);
      draw();
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const sp = eventPoint(e), p = world(sp);
    state.hoverPoint = sp;
    updateEraserOutline();
    $("#coords").innerHTML = `X ${Math.round(p.x)} &nbsp; Y ${Math.round(p.y)}`;
    if (!state.pointer) return;
    const q = state.pointer;
    q.moved = true;
    if (q.button === 1 || state.tool === "pan") {
      const dx = (sp.x - q.screen.x) / state.camera.zoom,
        dy = (sp.y - q.screen.y) / state.camera.zoom;
      state.camera.x -= dx;
      state.camera.y -= dy;
      q.screen = sp;
    } else if (
      (state.tool === "draw" || state.tool === "straight") && state.draft
    ) {
      if (state.tool === "straight") {
        const end = p;
        state.draft = [{
          a: q.start,
          b: end,
          type: state.lineType,
          width: state.width,
          side: q.side,
        }];
        q.trackChanged = true;
        q.drawLast = end;
      } else if (
        Math.hypot(p.x - q.drawLast.x, p.y - q.drawLast.y) >=
          3 / state.camera.zoom
      ) {
        state.draft.push({
          a: { ...q.drawLast },
          b: { ...p },
          type: state.lineType,
          width: state.width,
          side: q.side,
        });
        q.trackChanged = true;
        q.drawLast = p;
      }
    } else if (state.tool === "erase") {
      const i = hitLine(p);
      if (i >= 0) {
        if (!q.erasing) {
          save();
          q.erasing = true;
        }
        state.lines.splice(i, 1);
        q.trackChanged = true;
        updateStats();
      }
    } else if (state.tool === "select" && state.selected >= 0) {
      const dx = p.x - q.last.x, dy = p.y - q.last.y;
      if (!q.saved) {
        save();
        q.saved = true;
      }
      state.lines[state.selected].a.x += dx;
      state.lines[state.selected].a.y += dy;
      state.lines[state.selected].b.x += dx;
      state.lines[state.selected].b.y += dy;
      q.trackChanged = true;
    }
    q.last = p;
    if (q.trackChanged) queueTrackPreview();
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    const trackChanged = Boolean(state.pointer?.trackChanged);
    if (state.draft) {
      const finished = state.tool === "straight"
        ? state.draft
        : smoothStroke(state.draft);
      state.lines.push(...finished);
      state.draft = null;
      updateStats();
    }
    state.pointer = null;
    setTool(state.tool);
    if (trackChanged) rebuildPausedSimulation();
    else draw();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const sp = eventPoint(e),
      before = world(sp),
      factor = Math.exp(-e.deltaY * .001);
    state.camera.zoom = Math.max(.2, Math.min(4, state.camera.zoom * factor));
    state.camera.x = before.x - sp.x / state.camera.zoom;
    state.camera.y = before.y - sp.y / state.camera.zoom;
    $("#zoomReadout").textContent = Math.round(state.camera.zoom * 100) + "%";
    draw();
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  function updateEraserOutline() {
    const outline = $("#eraserOutline");
    outline.hidden = state.tool !== "erase" || !state.hoverPoint;
    if (!outline.hidden) {
      outline.style.left = state.hoverPoint.x + "px";
      outline.style.top = state.hoverPoint.y + "px";
    }
  }
  canvas.addEventListener("pointerleave", () => {
    state.hoverPoint = null;
    updateEraserOutline();
  });

  document.querySelectorAll(".tool[data-tool]").forEach((b) =>
    b.onclick = () => setTool(b.dataset.tool)
  );
  document.querySelectorAll("[data-line]").forEach((b) =>
    b.onclick = () => {
      state.lineType = b.dataset.line;
      if (state.tool !== "draw" && state.tool !== "straight") setTool("draw");
      document.querySelectorAll("[data-line]").forEach((x) =>
        x.classList.toggle("active", x === b)
      );
      $("#typeHelp").textContent = {
        regular: "Normal track surface",
        boost: "Accelerates the sled along the track",
        bounce: "Springs the sled away on impact",
      }[state.lineType];
    }
  );
  $("#lineWidth").oninput = (e) => {
    state.width = +e.target.value;
    $("#widthValue").textContent = state.width + " px";
  };
  $("#speedRange").oninput = (e) => {
    state.speed = +e.target.value;
    audio.playbackRate = state.speed;
    $("#speedValue").textContent = state.speed + "×";
  };
  $("#followRider").onchange = (e) => state.follow = e.target.checked;
  $("#playBtn").onclick = play;
  $("#pauseBtn").onclick = () => {
    endSpeedHold();
    pause();
  };
  $("#restartBtn").onclick = restart;
  let heldSpeed = null;
  function endSpeedHold() {
    if (!heldSpeed) return;
    const hold = heldSpeed;
    heldSpeed = null;
    state.speed = hold.speed;
    audio.playbackRate = state.speed;
    $("#speedValue").textContent = state.speed + "×";
    hold.button.classList.remove("speed-held");
    hold.button.setAttribute("aria-pressed", "false");
    if (hold.rewind && hold.wasRunning) play();
    else if (!hold.wasRunning) pause();
  }
  function bindSpeedHold(button, factor) {
    function begin() {
      if (heldSpeed?.button === button) return;
      endSpeedHold();
      heldSpeed = { button, speed: state.speed, wasRunning: state.running };
      if (factor < 0) {
        heldSpeed.rewind = true;
        heldSpeed.rate = Math.abs(factor) * state.speed;
        heldSpeed.elapsed = 0;
        pause();
        button.classList.add("speed-held");
        button.setAttribute("aria-pressed", "true");
        return;
      }
      state.speed = Math.max(.0625, Math.min(8, state.speed * factor));
      audio.playbackRate = state.speed;
      $("#speedValue").textContent = state.speed + "×";
      button.classList.add("speed-held");
      button.setAttribute("aria-pressed", "true");
      play();
    }
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.focus();
      button.setPointerCapture(event.pointerId);
      begin();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) {
      button.addEventListener(name, () => {
        if (heldSpeed?.button === button) endSpeedHold();
      });
    }
    button.addEventListener("keydown", event => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) begin();
      }
    });
    button.addEventListener("keyup", event => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        endSpeedHold();
      }
    });
  }
  bindSpeedHold($("#backTimeBtn"), -4);
  bindSpeedHold($("#forwardTimeBtn"), 4);
  window.addEventListener("blur", endSpeedHold);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) endSpeedHold();
  });

  let timelineDragging = false;
  $("#timeSlider").addEventListener("pointerdown", () => {
    timelineDragging = true;
    pause();
  });
  document.addEventListener("pointerup", () => timelineDragging = false);
  $("#timeSlider").oninput = (event) => {
    const requestedTime = Number(event.target.value);
    seekSimulation(requestedTime);
  };
  $("#undoBtn").onclick = undo;
  $("#redoBtn").onclick = redo;
  $("#clearBtn").onclick = () => {
    if (!state.lines.length) return;
    save();
    state.lines = [];
    state.selected = -1;
    restart();
    updateStats();
    toast("Track cleared");
  };
  $("#resetViewBtn").onclick = () => {
    state.camera = { x: 0, y: 0, zoom: 1 };
    $("#zoomReadout").textContent = "100%";
    draw();
  };
  $("#uploadBtn").onclick = () => $("#audioInput").click();
  $("#audioInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(file);
    audio.src = state.audioUrl;
    audio.playbackRate = state.speed;
    $("#songName").textContent = file.name.replace(/\.[^.]+$/, "");
    $("#songCard").classList.remove("hidden");
    $("#audioStatus").textContent = "LOADED";
    const label = $("#uploadBtn small");
    if (label) label.textContent = "Loaded";
    audio.onloadedmetadata = () =>
      $("#songDuration").textContent = `${Math.floor(audio.duration / 60)}:${
        String(Math.floor(audio.duration % 60)).padStart(2, "0")
      }`;
    syncAudio(true);
    toast("Soundtrack loaded");
  };
  $("#removeAudioBtn").onclick = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = null;
    $("#songCard").classList.add("hidden");
    $("#audioStatus").textContent = "NO AUDIO";
    const label = $("#uploadBtn small");
    if (label) label.textContent = "Music";
    $("#audioInput").value = "";
  };
  let lastSpaceTap = -Infinity;
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("#sledderIntro")) return;
    if (e.key === "Escape" && state.tool === "spawn") {
      setTool("draw");
      toast("Spawn placement cancelled");
      return;
    }
    if (e.target.matches("input")) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat || state.pointer) return;
      const now = performance.now();
      if (now - lastSpaceTap <= 300) {
        lastSpaceTap = -Infinity;
        endSpeedHold();
        restart();
      } else {
        lastSpaceTap = now;
        state.running ? pause() : play();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selected >= 0) {
        save();
        state.lines.splice(state.selected, 1);
        state.selected = -1;
        updateStats();
        rebuildPausedSimulation();
      }
    } else if (e.key.toLowerCase() === "d") setTool("draw");
    else if (e.key.toLowerCase() === "l") setTool("straight");
    else if (e.key.toLowerCase() === "v") setTool("select");
    else if (e.key.toLowerCase() === "e") setTool("erase");
    else if (e.key.toLowerCase() === "h") setTool("pan");
    else if (e.key.toLowerCase() === "r") restart();
  });

  function addToolbarButton({ id, icon, label, title = label, onClick }) {
    if (document.getElementById(id)) return;

    const button = document.createElement("button");
    button.id = id;
    button.className = "classic-tool";
    button.title = title;
    button.innerHTML = `<span>${icon}</span><small>${label}</small>`;
    button.addEventListener("click", onClick);

    const toolbarGroups = document.querySelectorAll(
      ".classicbar > .classic-group",
    );
    const toolbarGroup = ["saveTrackBtn", "loadTrackBtn", "recordVideoBtn"].includes(id)
      ? $("#settingsActions")
      : toolbarGroups[toolbarGroups.length - 1];
    toolbarGroup.append(button);
  }

  function saveTrack() {
    try {
      localStorage.setItem("lineSledderTrack", JSON.stringify({
        version: 2,
        lines: state.lines,
        riderCount: state.riderCount,
        spawnPoints: state.spawnPoints,
      }));
      toast("Track saved");
    } catch {
      toast("This browser blocked saving");
    }
  }

  function loadTrack(showMessage = true) {
    const savedTrack = localStorage.getItem("lineSledderTrack");
    if (!savedTrack) {
      if (showMessage) toast("No saved track");
      return;
    }

    try {
      const saved = JSON.parse(savedTrack);
      const lines = Array.isArray(saved) ? saved : saved.lines;
      if (!Array.isArray(lines)) throw new Error("Invalid track");
      state.lines = lines;
      state.riderCount = Number.isInteger(saved.riderCount)
        ? Math.max(1, Math.min(4, saved.riderCount)) : 1;
      state.spawnPoints = defaultSpawnPoints();
      if (Array.isArray(saved.spawnPoints)) {
        saved.spawnPoints.slice(0, 4).forEach((point, index) => {
          if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
            state.spawnPoints[index] = { x: point.x, y: point.y };
          }
        });
      }
      $("#riderCount").value = String(state.riderCount);
      updateSpawnControls();
      state.selected = -1;
      restart();
      updateStats();
      draw();
      if (showMessage) toast("Track loaded");
    } catch {
      toast("Saved track could not be loaded");
    }
  }

  (() => {
  const resetSingleRider = resetRider;
  const simulateSingleRider = simulate;
  const drawSingleRider = drawRider;

  state.riderCount = 1;
  state.riders = [];

  resetRider = function () {
    state.riders = [];

    for (let i = 0; i < state.riderCount; i++) {
      resetSingleRider();

      const rider = state.rider;
      const spawn = state.spawnPoints[i];
      rider.x = spawn.x;
      rider.y = spawn.y;

      rider.previousX = rider.x;
      rider.previousY = rider.y;

      rider.bodyX = rider.x;
      rider.bodyY = rider.y;

      rider.previousBodyX = rider.x;
      rider.previousBodyY = rider.y;

      state.riders.push(rider);
    }

    state.rider = state.riders[0];
  };

  simulate = function (dt, lines = state.lines) {
    if (!state.riders.length) {
      simulateSingleRider(dt, lines);
      return;
    }

    const cameraRider = state.riders[0];

    try {
      for (const rider of state.riders) {
        state.rider = rider;
        simulateSingleRider(dt, lines);
      }
    } finally {
      state.rider = cameraRider;
    }
  };

  drawRider = function () {
    if (!state.riders.length) {
      drawSingleRider();
      return;
    }

    const cameraRider = state.riders[0];

    try {
      for (const rider of state.riders) {
        state.rider = rider;
        drawSingleRider();
      }
    } finally {
      state.rider = cameraRider;
    }
  };

  function changeRiderCount(amount) {
    const nextCount = state.riderCount + amount;

    if (nextCount > 4) {
      toast("Maximum of four sledders");
      return;
    }

    if (nextCount < 1) {
      toast("Keep at least one sledder");
      return;
    }

    const currentTime = state.simTime;

    state.riderCount = nextCount;
    $("#riderCount").value = String(nextCount);
    state.spawnIndex = null;
    if (state.tool === "spawn") setTool("draw");
    updateSpawnControls();

    seekSimulation(currentTime, {
      keepCamera: true,
    });

    toast(
      `${state.riderCount} ${
        state.riderCount === 1 ? "sledder" : "sledders"
      }`
    );
  }

  $("#riderCount").onchange = event => {
    changeRiderCount(Number(event.target.value) - state.riderCount);
  };
})();

  function showSettings(open) {
    $("#settingsPanel").hidden = !open;
    $("#settingsBtn").setAttribute("aria-expanded", String(open));
    (open ? $("#closeSettingsBtn") : $("#settingsBtn")).focus();
  }
  function updateSpawnControls() {
    const list = $("#spawnControls");
    list.replaceChildren();
    state.spawnPoints.slice(0, state.riderCount).forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "spawn-row";
      const label = document.createElement("span");
      label.textContent = "Sledder " + (index + 1) + "\nX " + Math.round(point.x) + " · Y " + Math.round(point.y);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Place start";
      button.setAttribute("aria-label", "Place sledder " + (index + 1) + " start");
      button.onclick = () => {
        endSpeedHold();
        pause();
        setTool("spawn");
        state.spawnIndex = index;
        showSettings(false);
        toast("Click the map for sledder " + (index + 1) + " — Escape cancels");
      };
      row.append(label, button);
      list.append(row);
    });
  }
  $("#settingsBtn").onclick = () => showSettings($("#settingsPanel").hidden);
  $("#closeSettingsBtn").onclick = () => showSettings(false);
  $("#settingsPanel").addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") showSettings(false);
  });


  window.LineSledder = {
    addButton: addToolbarButton,
    saveTrack,
    loadTrack,
    seek: seekSimulation,
    redraw: draw,
    notify: toast,
    getState: () => state,
    getCanvas: () => canvas,
    getAudio: () => audio,
    restart,
    play,
    pause,
  };

  window.addEventListener("resize", resize);
  resetRider();
  loadTrack(false);
  updateSpawnControls();
  resize();
  requestAnimationFrame(tick);
})();
