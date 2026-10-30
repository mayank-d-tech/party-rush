import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Netlify function and frontend use the required direct endpoint and storage safety", async () => {
  const [toml, fn, frontend, manifest, engine] = await Promise.all([
    read("../netlify.toml"), read("../netlify/functions/game.ts"),
    read("../client/src/socket.js"), read("../package.json"), read("../netlify/lib/game-engine.js")
  ]);
  assert.match(toml, /functions\s*=\s*"netlify\/functions"/);
  assert.match(fn, /getStore\(\{\s*name:\s*"party-rush-rooms",\s*consistency:\s*"strong"\s*\}\)/);
  assert.match(fn, /onlyIfMatch:\s*entry\.etag/);
  assert.match(fn, /onlyIfNew:\s*true/);
  assert.match(fn, /from "\.\.\/lib\/game-engine\.js"/);
  assert.doesNotMatch(fn, /export\s+const\s+config\s*=\s*\{[^}]*path/s);
  assert.match(frontend, /const ENDPOINT = "\/.netlify\/functions\/game"/);
  assert.doesNotMatch(frontend, /\/api\/game|socket\.io/i);
  assert.doesNotMatch(manifest, /socket\.io|express|concurrently/);
  assert.match(engine, /export function finishMatch/);
});
