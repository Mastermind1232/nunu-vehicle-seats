// NuNu Vehicle Seats.
//
// A vehicle token covers a block of squares and nothing in the stack knows who
// is standing on them. The vehicles module records how many seats a vehicle has
// and never who is in them, and Foundry has no notion of one token being inside
// another, so a character dropped on a car is a character overlapping a car:
// drive away and they are left standing in the road.
//
// This makes every square of a vehicle's footprint a seat. Drop a character on
// one and it rides there. Drag it off and it gets out. The car carries whoever
// is aboard whenever it moves or turns.

const MOD = "nunu-vehicle-seats";
const VEHICLE_TYPE = "cyberpunk-red-vehicles.vehicle";

/** A vehicle is an actor from the vehicles module, or any token told it is one.
    The flag is the escape hatch for a boat, a flatbed or a lift platform that
    people are meant to stand on and that no actor type describes. */
export const isVehicle = (token) =>
  token?.actor?.type === VEHICLE_TYPE || token?.flags?.[MOD]?.isVehicle === true;

/** Where a passenger sits, held as a pixel offset in the vehicle's OWN frame:
    where the seat would be if the vehicle were not turned. Everything else is
    derived from that, so one stored pair of numbers survives the vehicle being
    driven, turned, or both at once. */
const rideOf = (token) => token?.flags?.[MOD]?.ride ?? null;

const gridOf = (scene) => scene?.grid?.size ?? canvas?.grid?.size ?? 100;

const sizeOf = (t, g) => ({ w: (t.width ?? 1) * g, h: (t.height ?? 1) * g });
const rectOf = (t, g, at = t) => ({ x: at.x, y: at.y, ...sizeOf(t, g) });
const centreOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const holds = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Foundry's canvas has y pointing down, so a positive angle here turns the same
    way the token's artwork does. */
export function turn(p, about, deg) {
  if (!deg) return { x: p.x, y: p.y };
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = p.x - about.x, dy = p.y - about.y;
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos };
}

const ridersOf = (vehicle, scene = vehicle.parent) =>
  scene.tokens.filter((t) => rideOf(t)?.vehicle === vehicle.id);

/** Where a seat actually lands on the canvas: the seat in the vehicle's own frame,
    turned around the vehicle's centre by however far the vehicle is turned. */
export function seatOnCanvas(vehicle, rider, ride, g, at = vehicle, deg = vehicle.rotation ?? 0) {
  const vs = sizeOf(vehicle, g), rs = sizeOf(rider, g);
  const pivot = { x: at.x + vs.w / 2, y: at.y + vs.h / 2 };
  const unturned = { x: at.x + ride.ox + rs.w / 2, y: at.y + ride.oy + rs.h / 2 };
  const p = turn(unturned, pivot, deg);
  return { x: p.x - rs.w / 2, y: p.y - rs.h / 2 };
}

/** The seat nearest where the token was actually dropped that nobody else holds,
    worked out in the vehicle's own frame so a turned vehicle seats people the same
    way an unturned one does. Two people cannot share a square, and a drop onto a
    taken seat slides to the next one rather than refusing the move, because losing
    a drag is worse than sitting one square over. */
export function freeSeat(vehicle, mover, want, g, scene) {
  const taken = ridersOf(vehicle, scene)
    .filter((t) => t.id !== mover.id)
    .map((t) => ({ x: vehicle.x + rideOf(t).ox, y: vehicle.y + rideOf(t).oy, ...sizeOf(t, g) }));
  const cols = Math.max(1, Math.round((vehicle.width ?? 1) - (mover.width ?? 1)) + 1);
  const rows = Math.max(1, Math.round((vehicle.height ?? 1) - (mover.height ?? 1)) + 1);
  const seats = [];
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const at = { x: vehicle.x + cx * g, y: vehicle.y + cy * g };
      if (taken.some((t) => overlaps(t, { ...at, ...sizeOf(mover, g) }))) continue;
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
  const where = centreOf(rectOf(doc, g, at));

  // Turn the drop point back into each vehicle's own frame before asking whether
  // it landed inside, so a turned vehicle can be boarded anywhere its artwork is.
  // The centre decides, not the overlap, so a token across two touching vehicles
  // boards the one it is standing on.
  const seen = (v) => turn(where, centreOf(rectOf(v, g)), -(v.rotation ?? 0));
  const vehicle = scene.tokens.find((t) =>
    t.id !== doc.id && isVehicle(t) && holds(rectOf(t, g), seen(t)));

  if (!vehicle) return rideOf(doc) ? { leave: true } : null;

  const rs = sizeOf(doc, g);
  const local = seen(vehicle);
  const seat = freeSeat(vehicle, doc, { x: local.x - rs.w / 2, y: local.y - rs.h / 2 }, g, scene);
  if (!seat) return { full: vehicle, leave: !!rideOf(doc) };

  const ride = { vehicle: vehicle.id, ox: seat.x - vehicle.x, oy: seat.y - vehicle.y };
  return { vehicle, ride, at: seatOnCanvas(vehicle, doc, ride, g) };
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
  if (!call.ride) return;

  changes.x = call.at.x;
  changes.y = call.at.y;
  foundry.utils.setProperty(changes, `flags.${MOD}.ride`, call.ride);
  // Ride at the vehicle's height, or a passenger in a flying AV stays on the ground.
  if (changes.elevation === undefined && doc.elevation !== call.vehicle.elevation) {
    changes.elevation = call.vehicle.elevation;
  }
});

/* --------------------------------------------------------------- carrying */

Hooks.on("updateToken", async (doc, changes, options) => {
  if (options?.[MOD]?.ridealong) return;
  if (!isVehicle(doc)) return;
  const moved = ["x", "y", "rotation", "elevation"].some((k) => changes[k] !== undefined);
  if (!moved) return;
  // Every GM client sees this hook, so the write is pinned to one of them.
  if (game.users.activeGM?.id !== game.user.id) return;

  const riders = ridersOf(doc);
  if (!riders.length) return;

  // On updateToken the document still holds the position it came from, so the
  // destination has to be read out of the changes. Reading doc.x here lands every
  // passenger on the square the vehicle left, one move behind it for ever.
  const g = gridOf(doc.parent);
  const at = { x: changes.x ?? doc.x, y: changes.y ?? doc.y };
  const deg = changes.rotation ?? doc.rotation ?? 0;
  const elevation = changes.elevation ?? doc.elevation;

  await doc.parent.updateEmbeddedDocuments("Token", riders.map((t) => ({
    _id: t.id, elevation, ...seatOnCanvas(doc, t, rideOf(t), g, at, deg),
  })), { [MOD]: { ridealong: true }, animate: true });
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
