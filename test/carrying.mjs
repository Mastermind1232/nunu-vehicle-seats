import { hookFor, scene, car, pc, aboard } from "./harness.mjs";
import { eq, runner } from "./_assert.mjs";
const { t, done } = runner();

// A scene that records what the hook asked it to write.
const recording = (tokens) => {
  const s = scene(tokens);
  s.writes = [];
  s.updateEmbeddedDocuments = async (type, updates, options) => { s.writes.push({ type, updates, options }); };
  for (const tk of s._list) tk.parent = s;
  return s;
};
const fire = (s, i, changes, options = {}) => hookFor("updateToken")(s._list[i], changes, options);

// On updateToken the document still holds the position it came from, so these
// tests give the vehicle doc its OLD position and put the destination in the
// changes, which is the shape Foundry actually hands the hook. A test where the
// two agree cannot tell a correct read from a stale one, and that is how the
// passengers shipped one move behind the car in 1.0.0.
await t("driving the car carries both passengers to where it is going", async () => {
  const s = recording([
    car({ x: 0, y: 0 }),                                      // the square it is leaving
    aboard(pc({ id: "a", x: 0, y: 0 }), "car", 0, 0),
    aboard(pc({ id: "b", x: 100, y: 300 }), "car", 100, 300),
  ]);
  await fire(s, 0, { x: 500, y: 700 });
  eq(s.writes[0].updates, [
    { _id: "a", x: 500, y: 700, elevation: 0 },
    { _id: "b", x: 600, y: 1000, elevation: 0 },
  ], "carry");
  eq(s.writes[0].options["nunu-vehicle-seats"], { ridealong: true }, "guard flag missing");
});

await t("a move on one axis only still reads the other off the document", async () => {
  const s = recording([car({ x: 300, y: 800 }), aboard(pc({ id: "a" }), "car", 0, 0)]);
  await fire(s, 0, { x: 500 });
  eq(s.writes[0].updates[0], { _id: "a", x: 500, y: 800, elevation: 0 }, "one axis");
});

// Turning. The 2x4 car at the origin is 200x400 with its centre at (100,200).
await t("turning the car on the spot swings its passengers round", async () => {
  const s = recording([car({ x: 0, y: 0, rotation: 0 }), aboard(pc({ id: "a" }), "car", 0, 0)]);
  await fire(s, 0, { rotation: 90 });
  eq(s.writes[0].updates[0], { _id: "a", x: 200, y: 100, elevation: 0 }, "turn");
});

await t("driving and turning at once does both", async () => {
  const s = recording([car({ x: 0, y: 0, rotation: 0 }), aboard(pc({ id: "a" }), "car", 0, 0)]);
  await fire(s, 0, { x: 1000, y: 1000, rotation: 180 });
  eq(s.writes[0].updates[0], { _id: "a", x: 1100, y: 1300, elevation: 0 }, "drive and turn");
});

await t("driving a car that is already turned keeps it turned", async () => {
  const s = recording([car({ x: 0, y: 0, rotation: 90 }), aboard(pc({ id: "a" }), "car", 0, 0)]);
  await fire(s, 0, { x: 500, y: 500 });                       // rotation is not in the changes
  eq(s.writes[0].updates[0], { _id: "a", x: 700, y: 600, elevation: 0 }, "kept rotation");
});

await t("an empty car writes nothing", async () => {
  const s = recording([car({ x: 0, y: 0 }), pc({ x: 900, y: 900 })]);
  await fire(s, 0, { x: 500, y: 700 });
  eq(s.writes.length, 0, "wrote for an empty car");
});

await t("a passenger moving does not drag the car", async () => {
  const s = recording([car(), aboard(pc(), "car", 0, 0)]);
  await fire(s, 1, { x: 100, y: 0 });
  eq(s.writes.length, 0, "a passenger moved the world");
});

await t("the carry does not recurse", async () => {
  const s = recording([car({ x: 0, y: 0 }), aboard(pc(), "car", 0, 0)]);
  await fire(s, 0, { x: 500, y: 700 }, { "nunu-vehicle-seats": { ridealong: true } });
  eq(s.writes.length, 0, "recursed");
});

await t("a change that is not movement is ignored", async () => {
  const s = recording([car(), aboard(pc(), "car", 0, 0)]);
  await fire(s, 0, { hidden: true });
  eq(s.writes.length, 0, "wrote on a non-move");
});

await t("climbing carries passengers up with it", async () => {
  const s = recording([car({ elevation: 0 }), aboard(pc(), "car", 0, 0)]);
  await fire(s, 0, { elevation: 60 });
  eq(s.writes[0].updates[0].elevation, 60, "elevation not carried");
});

await t("deleting the car puts its passengers back on their feet", async () => {
  const s = recording([car(), aboard(pc({ id: "a" }), "car", 0, 0)]);
  await hookFor("deleteToken")(s._list[0], {});
  eq(s.writes[0].updates, [{ _id: "a", "flags.nunu-vehicle-seats.-=ride": null }], "cleanup");
});

done();
