// Shared by the server and the browser. Every tuning value lives here.
// Single source of truth for gameplay tuning. Imported by BOTH server and client.
// Change a value here and both sides stay in sync. No magic numbers elsewhere.

export const NET = {
  TICK_RATE: 30,            // server simulation ticks per second
  SNAPSHOT_RATE: 30,        // state packets per second
  INTERP_DELAY_MS: 120,     // client renders this far in the past -> smooth motion
  MAX_INPUT_PER_SEC: 90,    // rate limit, anti-flood
  PING_INTERVAL_MS: 2000
};
export const TICK_DT = 1 / NET.TICK_RATE;

export const FIELD = {
  W: 1200,                  // playing area width  (goal to goal)
  H: 700,                   // playing area height (touchline to touchline)
  BORDER: 70                // grass runoff drawn outside the lines
};

export const GOAL = {
  MOUTH: 200,               // vertical size of the goal opening
  DEPTH: 46,                // how deep the net is
  POST_R: 7
};

export const PLAYER = {
  RADIUS: 20,
  ACCEL: 2200,              // units / s^2
  MAX_SPEED: 330,           // units / s
  SPRINT_MULT: 1.45,
  FRICTION: 8.5,            // velocity damping when no input
  MASS: 3,
  KICK_RANGE: 46,           // ball must be within this distance of player centre
  DRIBBLE_PUSH: 1.15        // how hard the body nudges the ball while running
};

export const STAMINA = {
  MAX: 100,
  DRAIN: 24,                // per second while sprinting
  REGEN: 15,                // per second while not sprinting
  MIN_TO_SPRINT: 10
};

export const BALL = {
  RADIUS: 11,
  FRICTION: 0.70,           // per-second velocity retention factor
  MAX_SPEED: 1050,
  WALL_BOUNCE: 0.70,
  PLAYER_BOUNCE: 0.55,
  MASS: 1
};

export const KICK = {
  MIN_POWER: 430,
  MAX_POWER: 1000,
  CHARGE_MS: 850,           // hold time to reach MAX_POWER
  PASS_POWER: 600,
  COOLDOWN_MS: 260,
  ASSIST_MAX_RAD: 0.30,     // strongest angle correction auto-aim may apply
  ASSIST_CONE_RAD: 0.62     // only assist if you were already roughly on target
};

export const MATCH = {
  DURATION: 180,            // seconds (3 minutes)
  KICKOFF_COUNTDOWN: 3,     // "3 2 1 KICK OFF"
  GOAL_CELEBRATION: 2.6,    // freeze after a goal
  RESTART_COUNTDOWN: 2
};

export const ROOM = {
  CODE_LENGTH: 5,
  CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // no 0/O/1/I confusion
  MAX_PLAYERS: 2,
  RECONNECT_GRACE_MS: 15000,
  IDLE_KILL_MS: 10 * 60 * 1000
};

export const TEAM = { RED: 'RED', BLUE: 'BLUE' };

// RED defends the left goal (x = 0), BLUE defends the right goal (x = FIELD.W)
export const TEAM_COLORS = {
  RED:  { main: '#ff3b52', dark: '#8f0f22', glow: 'rgba(255,59,82,.55)' },
  BLUE: { main: '#2f7bff', dark: '#0f2f7d', glow: 'rgba(47,123,255,.55)' }
};

export const NAME_MAX_LENGTH = 12;

export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  GOAL: 'goal',
  ENDED: 'ended'
};

// Kick-off spawn positions, mirrored per team. Index allows 2v2 / 5v5 later.
export function spawnPositions(team, index = 0) {
  const cy = FIELD.H / 2;
  const offsets = [
    { x: 0.30, y: 0.00 },
    { x: 0.16, y: -0.22 },
    { x: 0.16, y: 0.22 },
    { x: 0.08, y: 0.00 },
    { x: 0.42, y: 0.00 }
  ];
  const o = offsets[index % offsets.length];
  return team === TEAM.RED
    ? { x: FIELD.W * (0.5 - o.x), y: cy + FIELD.H * o.y }
    : { x: FIELD.W * (0.5 + o.x), y: cy - FIELD.H * o.y };
}

// Centre of the goal each team DEFENDS.
export const GOAL_CENTER = {
  RED:  { x: 0, y: FIELD.H / 2 },
  BLUE: { x: FIELD.W, y: FIELD.H / 2 }
};

// Centre of the goal each team ATTACKS.
export const TARGET_GOAL = {
  RED:  GOAL_CENTER.BLUE,
  BLUE: GOAL_CENTER.RED
};

// Player movement integration. Imported by the SERVER (authoritative) and by the
// CLIENT (prediction for your own player only). Identical maths on both sides
// means prediction and correction almost never disagree.


export function integratePlayer(p, input, dt) {
  let ax = input.ax, ay = input.ay;
  const mag = Math.hypot(ax, ay);
  if (mag > 1) { ax /= mag; ay /= mag; }

  const wantsSprint = !!input.sprint && mag > 0.15 && p.stamina > STAMINA.MIN_TO_SPRINT;
  p.sprinting = wantsSprint;
  p.stamina = Math.max(0, Math.min(STAMINA.MAX,
    p.stamina + (wantsSprint ? -STAMINA.DRAIN : STAMINA.REGEN) * dt));

  const maxSpeed = PLAYER.MAX_SPEED * (wantsSprint ? PLAYER.SPRINT_MULT : 1);

  if (mag > 0.05) {
    p.vx += ax * PLAYER.ACCEL * dt;
    p.vy += ay * PLAYER.ACCEL * dt;
    p.fx = ax / mag;
    p.fy = ay / mag;
  } else {
    p.vx -= p.vx * PLAYER.FRICTION * dt;
    p.vy -= p.vy * PLAYER.FRICTION * dt;
  }

  const sp = Math.hypot(p.vx, p.vy);
  if (sp > maxSpeed) { p.vx = (p.vx / sp) * maxSpeed; p.vy = (p.vy / sp) * maxSpeed; }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const r = PLAYER.RADIUS;
  if (p.x < r)           { p.x = r;           p.vx = 0; }
  if (p.x > FIELD.W - r) { p.x = FIELD.W - r; p.vx = 0; }
  if (p.y < r)           { p.y = r;           p.vy = 0; }
  if (p.y > FIELD.H - r) { p.y = FIELD.H - r; p.vy = 0; }
  return p;
}
