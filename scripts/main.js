// NuNu Vehicle Seats.
//
// A vehicle token covers a block of squares and nothing in the stack knows who
// is standing on them. The vehicles module stores a seat count and no occupants,
// and Foundry has no notion of one token being inside another, so a character
// dropped on a car is just a character overlapping a car: move the car and it is
// left behind in the road.
//
// This makes every square of a vehicle's footprint a seat. Drop a character on
// one and it rides there. Drag it off and it gets out. The car carries whoever
// is aboard whenever it moves.

const MOD = "nunu-vehicle-seats";
const VEHICLE_TYPE = "cyberpunk-red-vehicles.vehicle";

/** A vehicle is an actor from the vehicles module, or any token told it is one.
    The flag is the escape hatch for a boat, a flatbed or a tile-sized prop that
    people are meant to stand on but that no actor type describes. */
export const isVehicle = (token) =>
  token?.actor?.type === VEHICLE_TYPE || token?.flags?.[MOD]?.isVehicle === true;

/** Where a passenger sits, stored as a pixel offset from the vehicle's corner
    rather than a seat number. Foundry has already snapped the drop to the grid,
    so the offset is a square; keeping it in pixels means a half-grid vehicle or
    an unsnapped placement still carries its passengers correctly. */
const rideOf = (token) => token?.flags?.[MOD]?.ride ?? null;

const gridOf = (scene) => scene?.grid?.size ?? canvas?.grid?.size ?? 100;

const rectOf = (t, g, at = t) => ({ x: at.x, y: at.y, w: (t.width ?? 1) * g, h: (t.height ?? 1) * g });
const centreOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const holds = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const ridersOf = (vehicle, scene = vehicle.parent) =>
  scene.tokens.filter((t) => rideOf(t)?.vehicle === vehicle.id);

/** The seat nearest where the token was actually dropped that nobody else holds.
    Two people cannot share a square, so a drop onto an occupied seat slides to the
    next one along instead of refusing the move and losing the drag. */
export function freeSeat(vehicle, mover, want, g, scene) {
  const taken = ridersOf(vehicle, scene)
    .filter((t) => t.id !== mover.id)
    .map((t) => rectOf(t, g));
  const cols = Math.max(1, Math.round((vehicle.width ?? 1) - (mover.width ?? 1)) + 1);
  const rows = Math.max(1, Math.round((vehicle.height ?? 1) - (mover.height ?? 1)) + 1);
  const seats = [];
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const at = { x: vehicle.x + cx * g, y: vehicle.y + cy * g };
      if (taken.some((t) => overlaps(t, rectOf(mover, g, at)))) continue;
      seats.push({ ...at, away: Math.hypot(at.x - want.x, at.y - want.y) });
    }
  }
  seats.sort((a, b) => a.away - b.away);
  return seats[0] ?? null;
}

/* ------------------------------------------------------------- getting in */

/** What a move means: the vehicle and seat the token lands in, that it has left
    the one it was in, or that the vehicle it landed on is full. Kept out of the
    hook so the decision can be read and tested without a canvas under it. */
export function decideRide(doc, at, scene) {
  const g = gridOf(scene);
  // The centre decides, not the overlap, so a token straddling two vehicles
  // boards the one it is actually standing on.
  const where = centreOf(rectOf(doc, g, at));
  const vehicle = scene.tokens.find((t) => t.id !== doc.id && isVehicle(t) && holds(rectOf(t, g), where));
  if (!vehicle) return rideOf(doc) ? { leave: true } : null;
  const seat = freeSeat(vehicle, doc, at, g, scene);
  if (!seat) return { full: vehicle, leave: !!rideOf(doc) };
  return { vehicle, seat };
}

Hooks.on("preUpdateToken", (doc, changes, options) => {
  if (options?.[MOD]?.ridealong) return;                       // the vehicle is carrying it
  if (changes.x === undefined && changes.y === undefined) return;
  if (isVehicle(doc)) return;                                  // a car does not ride a car

  const at = { x: changes.x ?? doc.x, y: changes.y ?? doc.y };
  const call = decideRide(doc, at, doc.parent);
  if (!call) return;

  if (call.full && game.user.isGM) {
    ui.notifications.warn(`${call.full.name} has no free seat, so ${doc.name} did not get in.`);
  }
  if (call.leave) {
    foundry.utils.setProperty(changes, `flags.${MOD}.-=ride`, null);
    return;
  }
  if (!call.seat) return;

  changes.x = call.seat.x;
  changes.y = call.seat.y;
  foundry.utils.setProperty(changes, `flags.${MOD}.ride`, {
    vehicle: call.vehicle.id, ox: call.seat.x - call.vehicle.x, oy: call.seat.y - call.vehicle.y,
  });
  // Ride at the vehicle's height, or a passenger in a flying AV stays on the ground.
  if (changes.elevation === undefined && doc.elevation !== call.vehicle.elevation) {
    changes.elevation = call.vehicle.elevation;
  }
});

/* --------------------------------------------------------------- carrying */

Hooks.on("updateToken", async (doc, changes, options) => {
  if (options?.[MOD]?.ridealong) return;
  if (!isVehicle(doc)) return;
  if (changes.x === undefined && changes.y === undefined && changes.elevation === undefined) return;
  // Every GM client sees this hook, so the write is pinned to one of them.
  if (game.users.activeGM?.id !== game.user.id) return;

  const riders = ridersOf(doc);
  if (!riders.length) return;

  // On updateToken the document still holds the position it came from, so the
  // destination has to be read out of the changes. Reading doc.x here lands every
  // passenger on the square the vehicle left, one move behind it for ever.
  const to = {
    x: changes.x ?? doc.x,
    y: changes.y ?? doc.y,
    elevation: changes.elevation ?? doc.elevation,
  };

  await doc.parent.updateEmbeddedDocuments("Token", riders.map((t) => {
    const r = rideOf(t);
    return { _id: t.id, x: to.x + r.ox, y: to.y + r.oy, elevation: to.elevation };
  }), { [MOD]: { ridealong: true }, animate: true });
});

/* ------------------------------------------------------------ tidying up */

/** A deleted vehicle leaves its passengers where the road was. They are put back
    on their own feet rather than left pointing at a token that is gone. */
Hooks.on("deleteToken", async (doc, options) => {
  if (options?.[MOD]?.ridealong) return;
  if (!isVehicle(doc)) return;
  if (game.users.activeGM?.id !== game.user.id) return;
  const riders = ridersOf(doc);
  if (!riders.length) return;
  await doc.parent.updateEmbeddedDocuments("Token",
    riders.map((t) => ({ _id: t.id, [`flags.${MOD}.-=ride`]: null })),
    { [MOD]: { ridealong: true } });
});

/** A scene can be loaded holding rides whose vehicle was removed while nobody was
    watching, by an undo, a scene import or another client. Those are cleared once
    on load so a stale ride can never pin a token to a vehicle that is not there. */
Hooks.on("canvasReady", async () => {
  if (game.users.activeGM?.id !== game.user.id) return;
  const scene = canvas?.scene;
  if (!scene) return;
  const stale = scene.tokens.filter((t) => {
    const r = rideOf(t);
    return r && !scene.tokens.get(r.vehicle);
  });
  if (!stale.length) return;
  await scene.updateEmbeddedDocuments("Token",
    stale.map((t) => ({ _id: t.id, [`flags.${MOD}.-=ride`]: null })),
    { [MOD]: { ridealong: true } });
});
