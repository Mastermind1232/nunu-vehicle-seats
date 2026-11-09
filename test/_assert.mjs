// Deep equality that does not care about key order, because the thing under test
// builds its updates by spreading and a reordered object is not a regression.
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
  return typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v;   // kill float dust from turning
};
export const show = (v) => JSON.stringify(norm(v));
export const eq = (a, b, m) => {
  if (show(a) !== show(b)) throw new Error(`${m}: got ${show(a)}, want ${show(b)}`);
};
export const ok = (c, m) => { if (!c) throw new Error(m); };
export const runner = () => {
  const state = { pass: 0, fail: 0 };
  const t = async (label, fn) => {
    try { await fn(); console.log("  ok   " + label); state.pass++; }
    catch (e) { console.log("  FAIL " + label + ": " + e.message); state.fail++; }
  };
  const done = () => {
    console.log(`\n${state.pass} passed, ${state.fail} failed`);
    process.exit(state.fail ? 1 : 0);
  };
  return { t, done };
};
