import { randomBytes } from "node:crypto";

export const ROUND_IDS = ["quiz", "memory", "reflex", "words", "brain"];
export const SYMBOLS = ["●", "◆", "▲", "★"];
export const QUIZ = [
  { q: "Which planet is known as the Red Planet?", a: ["Venus", "Mars", "Jupiter", "Mercury"], correct: 1 },
  { q: "How many sides does a hexagon have?", a: ["5", "6", "7", "8"], correct: 1 },
  { q: "Which ocean is the largest?", a: ["Atlantic", "Indian", "Pacific", "Arctic"], correct: 2 },
  { q: "What is 12 × 8?", a: ["84", "92", "96", "108"], correct: 2 },
  { q: "Which gas do plants absorb?", a: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: 2 }
];
export const WORDS = [
  { word: "PLEPA", answer: "APPLE" }, { word: "NIRAT", answer: "TRAIN" },
  { word: "RTAES", answer: "STARE" }, { word: "HOCOSL", answer: "SCHOOL" },
  { word: "NOGRAD", answer: "DRAGON" }
];
export const BRAIN = [
  { q: "What comes next: 2, 4, 8, 16, __?", answer: "32" },
  { q: "What is 15% of 200?", answer: "30" },
  { q: "If 3 cats catch 3 mice in 3 minutes, how long for 6 cats to catch 6 mice?", answer: "3" },
  { q: "What is the square root of 144?", answer: "12" },
  { q: "A dozen plus half a dozen equals?", answer: "18" }
];

const titles = { quiz: "Quick Quiz", memory: "Memory Master", reflex: "Reflex Rush", words: "Word Scramble", brain: "Brain Battle" };
const makeToken = () => randomBytes(18).toString("hex");
export const makeRoomCode = () => randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
export const cleanName = value => String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Player";
const cleanAnswer = value => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const connectedPlayers = room => room.players.filter(player => player.connected);
const allSubmitted = room => connectedPlayers(room).length > 0 && connectedPlayers(room).every(player => player.submitted);

export function createRoom(name, now = Date.now()) {
  const token = makeToken();
  return {
    code: makeRoomCode(), hostToken: token,
    status: "lobby",
    players: [{ token, name: cleanName(name), score: 0, roundScores: [], roundWins: 0, connected: true, submitted: false, lastSeenAt: now }],
    roundIndex: -1, round: null, prompt: null, questionIndex: 0,
    deadline: null, advanceAt: null, memorySequence: [], leaderboard: [], champions: [], createdAt: now
  };
}

export function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostToken,
    status: room.status,
    players: room.players.map(player => ({ id: player.token, name: player.name, score: player.score, roundScores: [...player.roundScores], connected: player.connected, submitted: !!player.submitted })),
    roundIndex: room.roundIndex,
    round: room.round,
    roundTitle: titles[room.round],
    prompt: room.prompt?.type === "memory" && room.prompt.phase !== "memorize" ? { ...room.prompt, sequence: undefined } : room.prompt,
    questionIndex: room.questionIndex,
    questionTotal: 5,
    deadline: room.deadline,
    leaderboard: room.leaderboard || [],
    champions: room.champions || []
  };
}

function startQuestion(room, now) {
  const index = room.questionIndex;
  room.players.forEach(player => { player.submitted = !player.connected; player.falseStart = false; });
  room.advanceAt = null;
  if (room.round === "quiz") {
    const item = QUIZ[index]; room.prompt = { type: "quiz", title: item.q, options: item.a, number: index + 1 }; room.deadline = now + 15000;
  } else if (room.round === "words") {
    const item = WORDS[index]; room.prompt = { type: "words", title: "Unscramble this word", word: item.word, number: index + 1 }; room.deadline = now + 22000;
  } else if (room.round === "brain") {
    const item = BRAIN[index]; room.prompt = { type: "brain", title: item.q, number: index + 1 }; room.deadline = now + 22000;
  } else if (room.round === "memory") {
    room.memorySequence = Array.from({ length: 3 + index }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    room.prompt = { type: "memory", phase: "memorize", title: "Memorize the symbols", sequence: [...room.memorySequence], number: index + 1 };
    room.deadline = now + 4500;
  } else if (room.round === "reflex") {
    room.prompt = { type: "reflex", title: "Wait for the green signal…", phase: "wait", number: index + 1 };
    room.deadline = now + 2200 + Math.floor(Math.random() * 2600);
  }
}

export function beginRound(room, index, now = Date.now()) {
  if (index < 0 || index >= ROUND_IDS.length) throw new Error("Invalid round.");
  room.roundIndex = index; room.round = ROUND_IDS[index]; room.questionIndex = 0;
  room.status = "playing"; room.prompt = null; startQuestion(room, now);
}

function finishRound(room) {
  const best = Math.max(0, ...room.players.map(player => player.roundScores[room.roundIndex] || 0));
  room.players.forEach(player => { if ((player.roundScores[room.roundIndex] || 0) === best && best > 0) player.roundWins += 1; });
  room.leaderboard = [...room.players].map(player => ({ id: player.token, name: player.name, score: player.score, roundScore: player.roundScores[room.roundIndex] || 0, roundWins: player.roundWins }))
    .sort((a, b) => b.score - a.score || b.roundWins - a.roundWins || a.name.localeCompare(b.name));
  room.status = "leaderboard"; room.prompt = null; room.deadline = null; room.advanceAt = null;
}

function nextQuestion(room, now) {
  room.questionIndex += 1;
  if (room.questionIndex >= 5) return finishRound(room);
  startQuestion(room, now);
}

export function advanceRoom(room, now = Date.now()) {
  let changed = false;
  for (const player of room.players) {
    if (player.connected && now - player.lastSeenAt > 20000) {
      player.connected = false;
      if (room.status === "playing") player.submitted = true;
      changed = true;
    }
  }
  if (room.hostToken && !room.players.some(player => player.token === room.hostToken && player.connected)) {
    room.hostToken = connectedPlayers(room)[0]?.token || null; changed = true;
  }
  if (room.status !== "playing") return changed;
  if (allSubmitted(room) && room.advanceAt == null) { room.advanceAt = now + 650; changed = true; }
  if (room.advanceAt != null && now >= room.advanceAt) { nextQuestion(room, now); changed = true; return changed; }
  if (room.deadline != null && now >= room.deadline) {
    if (room.round === "memory" && room.prompt.phase === "memorize") {
      room.prompt = { type: "memory", phase: "recall", title: "Now repeat the sequence", number: room.questionIndex + 1 };
      room.deadline = now + 18000;
    } else if (room.round === "reflex" && room.prompt.phase === "wait") {
      room.prompt = { type: "reflex", phase: "go", title: "GO! TAP NOW!", goAt: now, number: room.questionIndex + 1 };
      room.deadline = now + 5000;
    } else {
      nextQuestion(room, now);
    }
    changed = true;
  }
  return changed;
}

export function submitAnswer(room, player, answer, now = Date.now()) {
  if (room.status !== "playing" || !room.prompt) return { ok: false, error: "There is no active challenge." };
  if (!player.connected) return { ok: false, error: "You are disconnected from this match." };
  if (player.submitted) return { ok: false, error: "Your answer has already been locked in." };
  if (now > room.deadline) return { ok: false, error: "Time is up! Wait for the next challenge." };
  let correct = false, points = 0;
  const remaining = Math.max(0, room.deadline - now);
  if (room.round === "quiz") {
    correct = answer !== null && answer !== undefined && String(answer).trim() !== "" && Number.isInteger(Number(answer)) && Number(answer) === QUIZ[room.questionIndex].correct;
    if (correct) points = 10 + Math.round(10 * remaining / 15000);
  } else if (room.round === "words") {
    correct = cleanAnswer(answer) === WORDS[room.questionIndex].answer;
    if (correct) points = 10 + Math.round(10 * remaining / 22000);
  } else if (room.round === "brain") {
    correct = cleanAnswer(answer) === BRAIN[room.questionIndex].answer;
    if (correct) points = 10 + Math.round(10 * remaining / 22000);
  } else if (room.round === "memory") {
    if (room.prompt.phase !== "recall") return { ok: false, error: "Wait until the symbols disappear before answering." };
    const submitted = Array.isArray(answer) ? answer.map(String) : String(answer || "").split(/[\s,]+/).filter(Boolean);
    correct = submitted.length === room.memorySequence.length && submitted.every((symbol, index) => symbol === room.memorySequence[index]);
    if (correct) points = 20;
  } else if (room.round === "reflex") {
    if (room.prompt.phase !== "go") {
      player.submitted = true; player.falseStart = true;
      if (allSubmitted(room)) room.advanceAt = now + 650;
      return { ok: true, correct: false, points: 0, message: "False start! You are locked out for this tap." };
    }
    correct = true; points = Math.max(0, 20 - Math.floor((now - room.prompt.goAt) / 250));
  }
  player.submitted = true;
  player.score += points;
  player.roundScores[room.roundIndex] = (player.roundScores[room.roundIndex] || 0) + points;
  if (allSubmitted(room)) room.advanceAt = now + 650;
  return { ok: true, correct, points, message: correct ? `Correct! +${points} points` : "Not quite — 0 points" };
}

export function finishMatch(room) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score || b.roundWins - a.roundWins || a.name.localeCompare(b.name));
  const top = sorted[0];
  const tied = sorted.filter(player => player.score === top?.score && player.roundWins === top?.roundWins);
  room.champions = tied.map(player => ({ id: player.token, name: player.name, score: player.score }));
  room.status = "finished";
  room.leaderboard = sorted.map(player => ({ id: player.token, name: player.name, score: player.score, roundWins: player.roundWins }));
}

export function addPlayer(room, name, now = Date.now()) {
  if (room.status !== "lobby") return { ok: false, error: "This match has already started." };
  if (room.players.length >= 8) return { ok: false, error: "This room is full (8 players)." };
  const token = makeToken();
  room.players.push({ token, name: cleanName(name), score: 0, roundScores: [], roundWins: 0, connected: true, submitted: false, lastSeenAt: now });
  if (!room.hostToken) room.hostToken = token;
  return { ok: true, token };
}
