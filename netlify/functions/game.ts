import { getStore } from "@netlify/blobs";
import {
  addPlayer, advanceRoom, beginRound, createRoom, finishMatch,
  publicRoom, submitAnswer
} from "../lib/game-engine.js";

const rooms = getStore({ name: "party-rush-rooms", consistency: "strong" });
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (error: string, status = 400) => json({ ok: false, error }, status);
const cleanCode = (value: unknown) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

async function mutateRoom(code: string, token: string | undefined, operation: (room: any, player: any, now: number) => { result: any; changed?: boolean }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const entry = await rooms.getWithMetadata(code, { consistency: "strong", type: "json" });
    if (!entry) return { missing: true as const };
    const room = structuredClone(entry.data as any);
    const now = Date.now();
    let changed = advanceRoom(room, now);
    const player = token ? room.players.find((candidate: any) => candidate.token === token) : undefined;
    if (player && now - player.lastSeenAt >= 6000) {
      player.lastSeenAt = now;
      player.connected = true;
      changed = true;
    }
    const outcome = operation(room, player, now);
    changed = changed || !!outcome.changed;
    if (!changed) return { result: outcome.result, room };
    const write = await rooms.setJSON(code, room, { onlyIfMatch: entry.etag });
    if (write.modified) return { result: outcome.result, room };
  }
  throw new Error("The room is busy. Please retry your action.");
}

export default async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail("Use POST for game actions.", 405);
  let body: any;
  try { body = await request.json(); } catch { return fail("Request body must be valid JSON.", 400); }
  const action = String(body?.action || "");

  try {
    if (action === "health") return json({ ok: true, name: "PARTY RUSH", version: "3.0.0" });

    if (action === "create") {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const room = createRoom(body.name);
        const write = await rooms.setJSON(room.code, room, { onlyIfNew: true });
        if (write.modified) return json({ ok: true, token: room.players[0].token, room: publicRoom(room) });
      }
      return fail("Could not create a room. Please try again.", 503);
    }

    const code = cleanCode(body.code);
    if (!code) return fail("Enter a valid six-character room code.");
    const token = typeof body.token === "string" ? body.token : "";

    if (action === "join") {
      const outcome = await mutateRoom(code, undefined, (room, _player, now) => {
        const result = addPlayer(room, body.name, now);
        return { result, changed: result.ok };
      });
      if ("missing" in outcome) return fail("Room not found. Check the code and try again.", 404);
      if (!outcome.result.ok) return fail(outcome.result.error);
      return json({ ok: true, token: outcome.result.token, room: publicRoom(outcome.room) });
    }

    const outcome = await mutateRoom(code, token, (room, player, now) => {
      if (action === "resume") {
        if (!player) return { result: { ok: false, error: "Your previous session expired. Join the room again." } };
        player.connected = true; player.lastSeenAt = now;
        return { result: { ok: true }, changed: true };
      }
      if (!player) return { result: { ok: false, error: "Your room session was not found." } };
      if (action === "state") return { result: { ok: true } };
      if (action === "start") {
        if (room.hostToken !== player.token) return { result: { ok: false, error: "Only the host can start." } };
        if (room.status !== "lobby") return { result: { ok: false, error: "The match has already started." } };
        if (room.players.filter((p: any) => p.connected).length < 2) return { result: { ok: false, error: "At least two connected players are required." } };
        room.players.forEach((p: any) => { p.score = 0; p.roundScores = []; p.roundWins = 0; p.submitted = false; });
        beginRound(room, 0, now);
        return { result: { ok: true }, changed: true };
      }
      if (action === "answer") {
        const result = submitAnswer(room, player, body.answer, now);
        return { result, changed: result.ok };
      }
      if (action === "next") {
        if (room.hostToken !== player.token || room.status !== "leaderboard") return { result: { ok: false, error: "Only the host can continue." } };
        if (room.roundIndex < 4) beginRound(room, room.roundIndex + 1, now);
        else finishMatch(room);
        return { result: { ok: true }, changed: true };
      }
      if (action === "leave") {
        room.players = room.players.filter((p: any) => p.token !== player.token);
        if (room.hostToken === player.token) room.hostToken = room.players.find((p: any) => p.connected)?.token || null;
        return { result: { ok: true }, changed: true };
      }
      return { result: { ok: false, error: "Unknown game action." } };
    });

    if ("missing" in outcome) return fail("Room not found. It may have expired.", 404);
    if (!outcome.result.ok) return fail(outcome.result.error || "Action failed.");
    return json({ ok: true, ...(action === "answer" ? outcome.result : {}), room: publicRoom(outcome.room) });
  } catch (error) {
    console.error("PARTY RUSH function error", error);
    return fail(error instanceof Error ? error.message : "The game service encountered an error.", 503);
  }
};
