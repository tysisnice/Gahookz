const ReactDOM = globalThis.ReactDOM;

if (!ReactDOM) throw new Error("ReactDOM failed to load.");

export const createRoot = ReactDOM.createRoot;
