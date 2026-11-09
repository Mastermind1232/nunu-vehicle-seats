// Loads the module with the Foundry globals it touches at import time mocked,
// then exercises the seating decision directly. No canvas, no browser.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.VS_SRC ?? path.join(HERE, "..", "scripts", "main.js");
const hooks = [];
const sandbox = {
  Hooks: { on: (name, fn) => hooks.push({ name, fn }) },
  canvas: { grid: { size: 100 }, scene: null },
  game: { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } },
  ui: { notifications: { warn: () => {}, error: () => {} } },
  foundry: { utils: { setProperty: (o, p, v) => {
    const parts = p.split("."); let cur = o;
    for (const k of parts.slice(0, -1)) cur = (cur[k] ??= {});
    cur[parts.at(-1)] = v;
  } } },
  console,
};
// Strip the export keywords so the file runs as a plain script, and hand the
// functions back through a global instead.
let code = fs.readFileSync(SRC, "utf8").replace(/^export /gm, "");
code += "\nglobalThis.__api = { decideRide, freeSeat, isVehicle };\n";
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: SRC });
export const api = sandbox.__api;
export const hookNames = hooks.map((h) => h.name);
export const hookFor = (name) => hooks.find((h) => h.name === name)?.fn;
export const G = 100;

// A scene is just a bag of tokens with a grid.
export function scene(tokens) {
  const list = tokens.map((t) => ({ width: 1, height: 1, elevation: 0, flags: {}, ...t }));
  return {
    grid: { size: G },
    tokens: {
      find: (f) => list.find(f),
      filter: (f) => list.filter(f),
      get: (id) => list.find((t) => t.id === id),
      [Symbol.iterator]: () => list[Symbol.iterator](),
    },
    _list: list,
  };
}
export const car = (o) => ({ id: "car", x: 0, y: 0, width: 2, height: 4, name: "Turbo-R",
  actor: { type: "cyberpunk-red-vehicles.vehicle" }, flags: {}, elevation: 0, ...o });
export const pc = (o) => ({ id: "pc", x: 0, y: 0, width: 1, height: 1, name: "Nyx",
  actor: { type: "character" }, flags: {}, elevation: 0, ...o });
export const aboard = (t, vehicle, ox, oy) =>
  ({ ...t, flags: { "nunu-vehicle-seats": { ride: { vehicle, ox, oy } } } });
