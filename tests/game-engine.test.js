import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlayer, advanceRoom, beginRound, createRoom, finishMatch, submitAnswer,
  QUIZ, WORDS, BRAIN, ROUND_IDS
} from "../netlify/lib/game-engine.js";

function answerBoth(room, firstAnswer, secondAnswer, now) {
  const [first, second] = room.players;
  first.connected = true; first.lastSeenAt = now;
  second.connected = true; second.lastSeenAt = now;
  const a = submitAnswer(room, first, firstAnswer, now);
  const b = submitAnswer(room, second, secondAnswer, now + 1);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  advanceRoom(room, now + 700);
}

test("two players complete three mini-game rounds; scoring and final champion are correct", () => {
  let now = 1_800_000_000_000;
  const room = createRoom("Winner", now);
  const join = addPlayer(room, "Runner", now);
  assert.equal(join.ok, true);
  assert.equal(room.players.length, 2);
  const rounds = ["quiz", "memory", "reflex"];
  assert.deepEqual(ROUND_IDS.slice(0, 3), rounds);

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    beginRound(room, roundIndex, now);
    for (let question = 0; question < 5; question += 1) {
      if (room.round === "quiz") {
        answerBoth(room, QUIZ[question].correct, -1, room.deadline - 15000 + 100);
      } else if (room.round === "memory") {
        room.players.forEach(player => { player.connected = true; player.lastSeenAt = room.deadline - 4500; });
        advanceRoom(room, room.deadline + 1);
        const sequence = [...room.memorySequence];
        assert.equal(room.prompt.phase, "recall");
        assert.equal(room.prompt.sequence, undefined);
        answerBoth(room, sequence, ["WRONG"], room.deadline - 100);
      } else if (room.round === "reflex") {
        room.players.forEach(player => { player.connected = true; player.lastSeenAt = room.deadline - 100; });
        const falseStart = submitAnswer(room, room.players[1], "tap", room.deadline - 100);
        assert.equal(falseStart.ok, true);
        advanceRoom(room, room.deadline + 1);
        const goAt = room.prompt.goAt;
        room.players[0].connected = true; room.players[0].lastSeenAt = goAt + 100;
        const reaction = submitAnswer(room, room.players[0], "tap", goAt + 100);
        assert.equal(reaction.ok, true);
        assert.equal(reaction.points, 20);
        advanceRoom(room, goAt + 751);
      }
      now = room.deadline ? room.deadline - 1000 : now + 2000;
    }
    assert.equal(room.status, "leaderboard", `${room.round} should finish with a leaderboard`);
    assert.equal(room.leaderboard[0].name, "Winner");
    assert.equal(room.leaderboard[0].roundScore > 0, true);
    assert.equal(room.leaderboard[1].roundScore, 0);
  }

  finishMatch(room);
  assert.equal(room.status, "finished");
  assert.equal(room.champions.length, 1);
  assert.equal(room.champions[0].name, "Winner");
  assert.equal(room.players[0].score, 300);
  assert.equal(room.players[1].score, 0);
});

test("Word Scramble and Brain Battle validate every supplied challenge", () => {
  let now = 1_800_100_000_000;
  const room = createRoom("Solver", now);
  addPlayer(room, "Challenger", now);
  for (const [roundIndex, dataset] of [[3, WORDS], [4, BRAIN]]) {
    beginRound(room, roundIndex, now);
    for (let index = 0; index < 5; index += 1) {
      const correct = dataset[index].answer;
      answerBoth(room, correct, "DEFINITELY WRONG", room.deadline - 2000);
      now = room.deadline ? room.deadline - 1000 : now + 1000;
    }
    assert.equal(room.status, "leaderboard");
    assert.equal(room.players[0].roundScores[roundIndex] > 0, true);
    assert.equal(room.players[1].roundScores[roundIndex] || 0, 0);
  }
});
