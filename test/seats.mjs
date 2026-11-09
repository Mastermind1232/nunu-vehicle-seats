import { api, hookFor, scene, car, pc, aboard, G } from "./harness.mjs";
const { decideRide, isVehicle } = api;

let pass = 0, fail = 0;
const t = (label, fn) => { try { fn(); console.log("  ok   " + label); pass++; }
  catch (e) { console.log("  FAIL " + label + ": " + e.message); fail++; } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

// --- what counts as a vehicle
t("a vehicle actor is a vehicle", () => ok(isVehicle(car()), "car"));
t("a character is not", () => ok(!isVehicle(pc()), "pc"));
t("the flag makes anything a vehicle", () =>
  ok(isVehicle({ actor: { type: "mook" }, flags: { "nunu-vehicle-seats": { isVehicle: true } } }), "flagged"));

// --- getting in
t("dropping on the car boards it", () => {
  const s = scene([car(), pc()]);
  const r = decideRide(s._list[1], { x: 100, y: 200 }, s);
  eq({ v: r.vehicle.id, seat: r.seat }, { v: "car", seat: { x: 100, y: 200, away: 0 } }, "board");
});
t("a drop between squares snaps to the nearest seat", () => {
  const s = scene([car(), pc()]);
  const r = decideRide(s._list[1], { x: 140, y: 190 }, s);
  eq({ x: r.seat.x, y: r.seat.y }, { x: 100, y: 200 }, "snap");
});
t("dropping outside the car boards nothing", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 500, y: 500 }, s), null, "no ride");
});
t("riding at the far corner still counts", () => {
  const s = scene([car(), pc()]);
  const r = decideRide(s._list[1], { x: 100, y: 300 }, s);
  eq({ x: r.seat.x, y: r.seat.y }, { x: 100, y: 300 }, "corner");
});
t("one square past the tail is outside", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 0, y: 400 }, s), null, "past tail");
});

// --- occupancy
t("a taken seat slides to the next one", () => {
  const s = scene([car(), aboard(pc({ id: "a", x: 100, y: 200 }), "car", 100, 200), pc({ id: "b" })]);
  const r = decideRide(s._list[2], { x: 100, y: 200 }, s);
  ok(!(r.seat.x === 100 && r.seat.y === 200), "did not slide off the taken seat");
  ok(r.vehicle.id === "car", "still boarded");
});
t("a full car refuses and says so", () => {
  const seats = [];
  for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 4; cy++)
    seats.push(aboard(pc({ id: `r${cx}${cy}`, x: cx * G, y: cy * G }), "car", cx * G, cy * G));
  const s = scene([car(), ...seats, pc({ id: "late" })]);
  const r = decideRide(s._list.at(-1), { x: 0, y: 0 }, s);
  eq({ full: r.full?.id, seat: r.seat }, { full: "car", seat: undefined }, "full");
});
t("moving within the car keeps the ride and takes the new seat", () => {
  const rider = aboard(pc({ x: 0, y: 0 }), "car", 0, 0);
  const s = scene([car(), rider]);
  const r = decideRide(s._list[1], { x: 100, y: 300 }, s);
  eq({ v: r.vehicle.id, x: r.seat.x, y: r.seat.y }, { v: "car", x: 100, y: 300 }, "seat change");
});

// --- getting out
t("dragging a rider off the car leaves it", () => {
  const s = scene([car(), aboard(pc({ x: 0, y: 0 }), "car", 0, 0)]);
  eq(decideRide(s._list[1], { x: 900, y: 900 }, s), { leave: true }, "leave");
});
t("a passer-by who was never aboard gets no leave", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 900, y: 900 }, s), null, "no spurious leave");
});

// --- two vehicles
t("the centre picks which of two touching vehicles you board", () => {
  const s = scene([car(), car({ id: "truck", x: 200, y: 0, width: 2, height: 2, name: "Mackinaw" }), pc()]);
  const r = decideRide(s._list[2], { x: 200, y: 0 }, s);
  eq(r.vehicle.id, "truck", "picked the wrong one");
});
// A big token sits across more than one square, so its corner and its centre can
// fall in different places. These two are what distinguish "the centre decides"
// from "anything touching counts"; a one-square token cannot tell them apart.
t("a big token boards the vehicle its centre is over, not its corner", () => {
  const s = scene([
    car({ id: "left", x: 0, y: 0, width: 2, height: 2 }),
    car({ id: "right", x: 200, y: 0, width: 2, height: 2 }),
    pc({ id: "big", width: 2, height: 2 }),
  ]);
  const r = decideRide(s._list[2], { x: 100, y: 0 }, s);   // corner in left, centre in right
  eq(r.vehicle.id, "right", "boarded by corner instead of centre");
});
t("a big token only clipping a corner does not board", () => {
  const s = scene([car({ x: 0, y: 0, width: 2, height: 2 }), pc({ id: "big", width: 2, height: 2 })]);
  const r = decideRide(s._list[1], { x: 100, y: 100 }, s); // overlaps one square, centre outside
  eq(r, null, "boarded on a clip");
});

t("a car does not board a car", () => {
  const s = scene([car(), car({ id: "two", x: 0, y: 0 })]);
  const hook = hookFor("preUpdateToken");
  const changes = { x: 0, y: 0 };
  hook(s._list[1], changes, {});
  eq(changes, { x: 0, y: 0 }, "a vehicle was seated");
});

// --- the hook itself
t("the hook writes the ride flag and snaps the position", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 140, y: 190 };
  hookFor("preUpdateToken")(doc, changes, {});
  eq({ x: changes.x, y: changes.y, ride: changes.flags["nunu-vehicle-seats"].ride },
     { x: 100, y: 200, ride: { vehicle: "car", ox: 100, oy: 200 } }, "hook");
});
t("the hook ignores a move it made itself", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 140, y: 190 };
  hookFor("preUpdateToken")(doc, changes, { "nunu-vehicle-seats": { ridealong: true } });
  eq(changes, { x: 140, y: 190 }, "ridealong was re-seated");
});
t("the hook clears the flag on the way out", () => {
  const s = scene([car(), aboard(pc(), "car", 0, 0)]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 900, y: 900 };
  hookFor("preUpdateToken")(doc, changes, {});
  ok("-=ride" in changes.flags["nunu-vehicle-seats"], "ride not cleared");
});
t("a move with no x or y is left alone", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { hidden: true };
  hookFor("preUpdateToken")(doc, changes, {});
  eq(changes, { hidden: true }, "touched a non-move");
});
t("a passenger takes the vehicle's elevation", () => {
  const s = scene([car({ elevation: 40 }), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 0, y: 0 };
  hookFor("preUpdateToken")(doc, changes, {});
  eq(changes.elevation, 40, "elevation not carried");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
