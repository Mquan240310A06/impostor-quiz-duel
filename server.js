const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const QUESTION_BANK = [
  {
    id: 'q1',
    prompt: '5 + 7 x 2 = ?',
    options: ['24', '19', '17', '22'],
    correctIndex: 1,
  },
  {
    id: 'q2',
    prompt: 'Từ nào đồng nghĩa với "Impostor"?',
    options: ['Detective', 'Deceiver', 'Crewmate', 'Captain'],
    correctIndex: 1,
  },
  {
    id: 'q3',
    prompt: 'Hành tinh nào gần Mặt Trời nhất?',
    options: ['Sao Kim', 'Sao Thủy', 'Sao Hỏa', 'Trái Đất'],
    correctIndex: 1,
  },
  {
    id: 'q4',
    prompt: 'Mã nhị phân của số 5 là gì?',
    options: ['101', '110', '011', '111'],
    correctIndex: 0,
  },
  {
    id: 'q5',
    prompt: 'Trong Among Us, màu thẻ ID mặc định là gì?',
    options: ['Xanh lam', 'Đỏ', 'Vàng cam', 'Xanh lục'],
    correctIndex: 0,
  },
];

const rooms = new Map();

function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        roomId,
        hostId: socket.id,
        gameState: 'LOBBY',
        settings: {
          maxPlayers: 10,
          killCooldownSec: 15,
          questionTimeLimitSec: 6,
          killRangePx: 90,
        },
        players: new Map(),
        activeDuels: new Map(),
      });
    }

    const room = rooms.get(roomId);
    const newPlayer = {
      id: socket.id,
      username: username || `Astronaut_${socket.id.substring(0, 4)}`,
      role: 'crew',
      x: 300 + Math.random() * 200,
      y: 300 + Math.random() * 200,
      isAlive: true,
      isGhost: false,
      isDueling: false,
      isStunned: false,
      stunUntil: 0,
      killCooldown: 0,
      invincibleUntil: 0,
    };

    room.players.set(socket.id, newPlayer);

    io.to(roomId).emit('room_state_update', {
      players: Array.from(room.players.values()),
      gameState: room.gameState,
    });
  });

  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.gameState = 'PLAYING';
    const playerList = Array.from(room.players.values());
    const shuffled = [...playerList].sort(() => 0.5 - Math.random());
    const half = Math.ceil(shuffled.length / 2);

    shuffled.forEach((p, idx) => {
      const player = room.players.get(p.id);
      player.role = idx < half ? 'impostor' : 'crew';
      player.isAlive = true;
      player.isGhost = false;
      player.isDueling = false;
      player.killCooldown = Date.now() + 10000;
      io.to(player.id).emit('role_assigned', { role: player.role });
    });

    io.to(roomId).emit('game_started', {
      players: Array.from(room.players.values()),
    });
  });

  socket.on('player_move', ({ roomId, x, y }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player || !player.isAlive || player.isDueling || player.isStunned) return;

    if (player.isStunned && Date.now() > player.stunUntil) {
      player.isStunned = false;
    }

    player.x = x;
    player.y = y;
    socket.to(roomId).emit('player_moved', { id: socket.id, x, y });
  });

  socket.on('trigger_kill_duel', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room || room.gameState !== 'PLAYING') return;

    const attacker = room.players.get(socket.id);
    const target = room.players.get(targetId);
    const now = Date.now();

    if (!attacker || !target) return;
    if (attacker.role !== 'impostor' || !attacker.isAlive || attacker.isDueling) return;
    if (!target.isAlive || target.isDueling || target.isGhost) return;
    if (now < attacker.killCooldown) return;
    if (now < target.invincibleUntil) return;

    const dist = getDistance(attacker.x, attacker.y, target.x, target.y);
    if (dist > room.settings.killRangePx) return;

    const duelId = `duel_${Date.now()}_${attacker.id.substring(0, 4)}`;
    const question = QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
    const durationMs = room.settings.questionTimeLimitSec * 1000;

    attacker.isDueling = true;
    target.isDueling = true;

    const session = {
      duelId,
      roomId,
      attackerId: attacker.id,
      defenderId: target.id,
      questionId: question.id,
      correctIndex: question.correctIndex,
      startedAt: now,
      expiresAt: now + durationMs,
      timeoutHandle: null,
      submissions: new Map(),
      status: 'PENDING',
    };

    session.timeoutHandle = setTimeout(() => {
      resolveDuel(roomId, duelId);
    }, durationMs + 200);

    room.activeDuels.set(duelId, session);

    io.to(roomId).emit('duel_locked_broadcast', {
      attackerId: attacker.id,
      defenderId: target.id,
      x: (attacker.x + target.x) / 2,
      y: (attacker.y + target.y) / 2,
    });

    const clientPayload = {
      duelId,
      prompt: question.prompt,
      options: question.options,
      durationMs,
    };

    io.to(attacker.id).emit('duel_start', {
      ...clientPayload,
      opponentUsername: target.username,
      opponentId: target.id,
      role: attacker.role,
    });

    io.to(target.id).emit('duel_start', {
      ...clientPayload,
      opponentUsername: attacker.username,
      opponentId: attacker.id,
      role: target.role,
    });
  });

  socket.on('submit_duel_answer', ({ roomId, duelId, selectedOption }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const session = room.activeDuels.get(duelId);
    if (!session || session.status !== 'PENDING') return;

    if (socket.id !== session.attackerId && socket.id !== session.defenderId) return;
    if (session.submissions.has(socket.id)) return;

    const receiveTime = Date.now();
    const elapsed = receiveTime - session.startedAt;
    const isCorrect = selectedOption === session.correctIndex;

    session.submissions.set(socket.id, {
      selectedOption,
      serverReceivedAt: receiveTime,
      elapsedMs: elapsed,
      isCorrect,
    });

    if (session.submissions.size === 2) {
      if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
      resolveDuel(roomId, duelId);
    }
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        io.to(roomId).emit('player_left', { id: socket.id });
        if (room.players.size === 0) {
          rooms.delete(roomId);
        }
      }
    }
  });
});

function resolveDuel(roomId, duelId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const session = room.activeDuels.get(duelId);
  if (!session || session.status !== 'PENDING') return;

  session.status = 'RESOLVING';

  const attacker = room.players.get(session.attackerId);
  const defender = room.players.get(session.defenderId);

  const subA = session.submissions.get(session.attackerId) || {
    isCorrect: false,
    elapsedMs: Infinity,
  };
  const subD = session.submissions.get(session.defenderId) || {
    isCorrect: false,
    elapsedMs: Infinity,
  };

  let winnerId = null;
  let loserId = null;
  let isDraw = false;

  if (subA.isCorrect && !subD.isCorrect) {
    winnerId = session.attackerId;
    loserId = session.defenderId;
  } else if (!subA.isCorrect && subD.isCorrect) {
    winnerId = session.defenderId;
    loserId = session.attackerId;
  } else if (subA.isCorrect && subD.isCorrect) {
    if (subA.elapsedMs < subD.elapsedMs) {
      winnerId = session.attackerId;
      loserId = session.defenderId;
    } else if (subD.elapsedMs < subA.elapsedMs) {
      winnerId = session.defenderId;
      loserId = session.attackerId;
    } else {
      isDraw = true;
    }
  } else {
    isDraw = true;
  }

  const now = Date.now();

  if (attacker) attacker.isDueling = false;
  if (defender) defender.isDueling = false;

  let message = '';

  if (isDraw) {
    message = 'Trận đấu bất phân thắng bại! Cả hai bị choáng 3 giây!';
    if (attacker) {
      attacker.isStunned = true;
      attacker.stunUntil = now + 3000;
      attacker.killCooldown = now + 5000;
    }
    if (defender) {
      defender.isStunned = true;
      defender.stunUntil = now + 3000;
    }
  } else {
    const winner = room.players.get(winnerId);
    const loser = room.players.get(loserId);

    loser.isAlive = false;
    loser.isGhost = true;

    message = `${winner.username} đã hạ gục ${loser.username} trong trận quyết đấu tốc độ!`;

    if (winnerId === session.attackerId) {
      attacker.killCooldown = now + room.settings.killCooldownSec * 1000;
    } else {
      defender.invincibleUntil = now + 3000;
    }

    io.to(roomId).emit('player_died', {
      victimId: loserId,
      bodyLocation: { x: loser.x, y: loser.y },
    });
  }

  io.to(session.attackerId).emit('duel_outcome', {
    result: isDraw ? 'DRAW' : winnerId === session.attackerId ? 'VICTORY' : 'DEFEAT',
    subA,
    subD,
    correctIndex: session.correctIndex,
  });

  io.to(session.defenderId).emit('duel_outcome', {
    result: isDraw ? 'DRAW' : winnerId === session.defenderId ? 'VICTORY' : 'DEFEAT',
    subA,
    subD,
    correctIndex: session.correctIndex,
  });

  io.to(roomId).emit('duel_resolved_broadcast', {
    duelId,
    winnerId,
    loserId,
    isDraw,
    message,
  });

  room.activeDuels.delete(duelId);
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[QUIZ-DUEL] Server listening on port ${PORT}`);
});
