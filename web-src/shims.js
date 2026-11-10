// Browser stand-ins for the two Node globals some wallet packages expect.
import { Buffer } from "buffer";
export { Buffer };
export const process = { env: { NODE_ENV: "production" }, browser: true, version: "", versions: {}, nextTick: (fn, ...a) => Promise.resolve().then(() => fn(...a)) };
