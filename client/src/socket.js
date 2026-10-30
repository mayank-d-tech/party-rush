const ENDPOINT = "/.netlify/functions/game";
const handlers = new Map();
let session = null;
let pollTimer = null;
let polling = false;
let connected = false;
let pollBusy = false;

function dispatch(event, value) {
  for (const handler of handlers.get(event) || []) handler(value);
}
function setConnected(value) {
  if (connected === value) return;
  connected = value;
  socket.connected = value;
  dispatch(value ? "connect" : "disconnect");
}
async function request(action, payload = {}) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({ ok: false, error: "The game service returned an invalid response." }));
  if (!response.ok && result.ok !== false) return { ok: false, error: `Game service error (${response.status}).` };
  return result;
}
function stopPolling() {
  polling = false;
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = null;
}
function startPolling() {
  if (!session) return;
  polling = true;
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(poll, 1000);
}
async function poll() {
  if (!polling || !session || pollBusy) return;
  pollBusy = true;
  try {
    const result = await request("state", session);
    if (!result.ok) {
      if (result.error?.includes("not found") || result.error?.includes("expired")) {
        stopPolling(); session = null;
        localStorage.removeItem("partyRushRoom"); localStorage.removeItem("partyRushToken");
      }
      throw new Error(result.error || "Connection lost.");
    }
    setConnected(true);
    dispatch("room:update", result.room);
  } catch {
    setConnected(false);
  } finally {
    pollBusy = false;
    if (polling) pollTimer = window.setTimeout(poll, 1500);
  }
}

export const socket = {
  connected: false,
  on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(handler);
    return this;
  },
  off(event, handler) {
    handlers.get(event)?.delete(handler);
    return this;
  },
  emit(event, payload = {}, callback = () => {}) {
    const actions = {
      "room:create": "create", "room:join": "join", "room:resume": "resume",
      "game:start": "start", "game:answer": "answer", "game:next": "next", "room:leave": "leave"
    };
    const action = actions[event];
    if (!action) return;
    if (event === "room:leave") {
      const oldSession = session;
      stopPolling(); session = null;
      request(action, oldSession || {}).then(result => callback(result)).catch(error => callback({ ok: false, error: error.message }));
      return;
    }
    const body = { ...(payload || {}) };
    if (["game:start", "game:answer", "game:next"].includes(event)) body.code = session?.code;
    if (["room:resume"].includes(event)) body.code = payload.code;
    if (["room:resume"].includes(event)) body.token = payload.token;
    if (["game:start", "game:answer", "game:next"].includes(event)) body.token = session?.token;
    request(action, body).then(result => {
      if (result.ok && result.token && result.room?.code) {
        session = { code: result.room.code, token: result.token };
        startPolling();
      } else if (result.ok && event === "room:resume") {
        session = { code: payload.code, token: payload.token };
        startPolling();
      }
      if (result.room) dispatch("room:update", result.room);
      setConnected(true);
      callback(result);
    }).catch(error => {
      setConnected(false);
      callback({ ok: false, error: error.message || "Unable to reach the game service." });
    });
  }
};

request("health").then(result => {
  if (result.ok) setConnected(true);
  else setConnected(false);
}).catch(() => setConnected(false));
