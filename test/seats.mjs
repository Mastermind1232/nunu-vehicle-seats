import { api, hookFor, scene, car, pc, aboard, G } from "./harness.mjs";
import { eq, ok, runner } from "./_assert.mjs";
const { decideRide, isVehicle, turn, seatOnCanvas } = api;
const { t, done } = runner();

// --- what counts as a vehicle
await t("a vehicle actor is a vehicle", () => ok(isVehicle(car()), "car"));
await t("a character is not", () => ok(!isVehicle(pc()), "pc"));
await t("the flag makes anything a vehicle", () =>
  ok(isVehicle({ actor: { type: "mook" }, flags: { "nunu-vehicle-seats": { isVehicle: true } } }), "flagged"));

// --- getting in
await t("dropping on the car boards it", () => {
  const s = scene([car(), pc()]);
  const r = decideRide(s._list[1], { x: 100, y: 200 }, s);
  eq({ v: r.vehicle.id, ride: r.ride, at: r.at },
     { v: "car", ride: { vehicle: "car", ox: 100, oy: 200 }, at: { x: 100, y: 200 } }, "board");
});
await t("a drop between squares snaps to the nearest seat", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 140, y: 190 }, s).at, { x: 100, y: 200 }, "snap");
});
await t("dropping outside the car boards nothing", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 500, y: 500 }, s), null, "no ride");
});
await t("riding at the far corner still counts", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 100, y: 300 }, s).at, { x: 100, y: 300 }, "corner");
});
await t("one square past the tail is outside", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 0, y: 400 }, s), null, "past tail");
});

// --- occupancy, which is worked out in the vehicle's own frame
await t("a taken seat slides to the next one", () => {
  const s = scene([car(), aboard(pc({ id: "a", x: 100, y: 200 }), "car", 100, 200), pc({ id: "b" })]);
  const r = decideRide(s._list[2], { x: 100, y: 200 }, s);
  ok(!(r.ride.ox === 100 && r.ride.oy === 200), "did not slide off the taken seat");
  ok(r.vehicle.id === "car", "still boarded");
});
await t("a full car refuses and says so", () => {
  const seats = [];
  for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 4; cy++)
    seats.push(aboard(pc({ id: `r${cx}${cy}`, x: cx * G, y: cy * G }), "car", cx * G, cy * G));
  const s = scene([car(), ...seats, pc({ id: "late" })]);
  const r = decideRide(s._list.at(-1), { x: 0, y: 0 }, s);
  eq({ full: r.full?.id, ride: r.ride }, { full: "car" }, "full");
});
await t("moving within the car keeps the ride and takes the new seat", () => {
  const s = scene([car(), aboard(pc({ x: 0, y: 0 }), "car", 0, 0)]);
  const r = decideRide(s._list[1], { x: 100, y: 300 }, s);
  eq({ v: r.vehicle.id, ride: r.ride }, { v: "car", ride: { vehicle: "car", ox: 100, oy: 300 } }, "seat change");
});

// --- getting out
await t("dragging a rider off the car leaves it", () => {
  const s = scene([car(), aboard(pc({ x: 0, y: 0 }), "car", 0, 0)]);
  eq(decideRide(s._list[1], { x: 900, y: 900 }, s), { leave: true }, "leave");
});
await t("a passer-by who was never aboard gets no leave", () => {
  const s = scene([car(), pc()]);
  eq(decideRide(s._list[1], { x: 900, y: 900 }, s), null, "no spurious leave");
});

// --- turning. A 2x4 car at the origin is 200x400 with its centre at (100,200).
await t("turning is a no-op at zero degrees", () =>
  eq(turn({ x: 10, y: 20 }, { x: 0, y: 0 }, 0), { x: 10, y: 20 }, "zero"));
await t("a quarter turn carries the nose seat round to the side", () => {
  const seat = seatOnCanvas(car(), pc(), { ox: 0, oy: 0 }, G, car(), 90);
  eq(seat, { x: 200, y: 100 }, "90 deg");
});
await t("a half turn puts the nose seat in the tail", () => {
  const seat = seatOnCanvas(car(), pc(), { ox: 0, oy: 0 }, G, car(), 180);
  eq(seat, { x: 100, y: 300 }, "180 deg");
});
await t("a full turn puts it back", () => {
  const seat = seatOnCanvas(car(), pc(), { ox: 0, oy: 0 }, G, car(), 360);
  eq(seat, { x: 0, y: 0 }, "360 deg");
});
await t("boarding a turned car reads the seat in the car's own frame", () => {
  const s = scene([car({ rotation: 90 }), pc()]);
  const r = decideRide(s._list[1], { x: 200, y: 100 }, s);   // where the nose seat now is
  eq({ ride: r.ride, at: r.at },
     { ride: { vehicle: "car", ox: 0, oy: 0 }, at: { x: 200, y: 100 } }, "board turned");
});
await t("a drop on where a turned car is NOT does not board it", () => {
  const s = scene([car({ rotation: 90 }), pc()]);
  eq(decideRide(s._list[1], { x: 0, y: 0 }, s), null, "boarded empty ground");
});

// --- centre, not corner
await t("a big token boards the vehicle its centre is over, not its corner", () => {
  const s = scene([
    car({ id: "left", x: 0, y: 0, width: 2, height: 2 }),
    car({ id: "right", x: 200, y: 0, width: 2, height: 2 }),
    pc({ id: "big", width: 2, height: 2 }),
  ]);
  eq(decideRide(s._list[2], { x: 100, y: 0 }, s).vehicle.id, "right", "boarded by corner");
});
await t("a big token only clipping a corner does not board", () => {
  const s = scene([car({ x: 0, y: 0, width: 2, height: 2 }), pc({ id: "big", width: 2, height: 2 })]);
  eq(decideRide(s._list[1], { x: 100, y: 100 }, s), null, "boarded on a clip");
});

// --- the hook itself
await t("a car does not board a car", () => {
  const s = scene([car(), car({ id: "two", x: 0, y: 0 })]);
  const changes = { x: 0, y: 0 };
  hookFor("preUpdateToken")(s._list[1], changes, {});
  eq(changes, { x: 0, y: 0 }, "a vehicle was seated");
});
await t("the hook writes the ride flag and snaps the position", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 140, y: 190 };
  hookFor("preUpdateToken")(doc, changes, {});
  eq({ x: changes.x, y: changes.y, ride: changes.flags["nunu-vehicle-seats"].ride },
     { x: 100, y: 200, ride: { vehicle: "car", ox: 100, oy: 200 } }, "hook");
});
await t("the hook ignores a move it made itself", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 140, y: 190 };
  hookFor("preUpdateToken")(doc, changes, { "nunu-vehicle-seats": { ridealong: true } });
  eq(changes, { x: 140, y: 190 }, "ridealong was re-seated");
});
await t("the hook clears the flag on the way out", () => {
  const s = scene([car(), aboard(pc(), "car", 0, 0)]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 900, y: 900 };
  hookFor("preUpdateToken")(doc, changes, {});
  ok("-=ride" in changes.flags["nunu-vehicle-seats"], "ride not cleared");
});
await t("a move with no x or y is left alone", () => {
  const s = scene([car(), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { hidden: true };
  hookFor("preUpdateToken")(doc, changes, {});
  eq(changes, { hidden: true }, "touched a non-move");
});
await t("a passenger takes the vehicle's elevation", () => {
  const s = scene([car({ elevation: 40 }), pc()]);
  const doc = s._list[1]; doc.parent = s;
  const changes = { x: 0, y: 0 };
  hookFor("preUpdateToken")(doc, changes, {});
  eq(changes.elevation, 40, "elevation not carried");
});

done();
