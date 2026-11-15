const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('join-room', ({ roomCode, playerName, role, cheatUnlocked }) => {
        socket.join(roomCode);
        
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: {},
                pingTimer: null,
                pingTimeLeft: 300 // 5 minutes
            };
        }

        const cleanName = playerName ? playerName.trim() : (role === 'runner' ? 'Runner' : 'Seeker');

        rooms[roomCode].players[socket.id] = {
            id: socket.id,
            name: cleanName,
            role: role,
            lat: 12.9716, 
            lng: 77.5946,
            status: 'active',
            cheatUnlocked: cheatUnlocked || false
        };

        console.log(`Player ${cleanName} joined room ${roomCode} as ${role} (Cheat Unlocked: ${cheatUnlocked})`);

        io.to(roomCode).emit('update-players', rooms[roomCode].players);

        const currentMins = String(Math.floor(rooms[roomCode].pingTimeLeft / 60)).padStart(2, '0');
        const currentSecs = String(rooms[roomCode].pingTimeLeft % 60).padStart(2, '0');
        socket.emit('timer-update', { timeFormatted: `${currentMins}:${currentSecs}` });

        if (!rooms[roomCode].pingTimer) {
            rooms[roomCode].pingTimer = setInterval(() => {
                const room = rooms[roomCode];
                if (!room) return;
                
                room.pingTimeLeft--;

                if (room.pingTimeLeft <= 0) {
                    room.pingTimeLeft = 300;
                    
                    const activeRunners = Object.values(room.players).filter(p => p.role === 'runner' && p.status === 'active');
                    activeRunners.forEach(runner => {
                        io.to(roomCode).emit('runner-ping', {
                            lat: runner.lat,
                            lng: runner.lng,
                            runnerId: runner.id,
                            message: `🚨 ${runner.name.toUpperCase()} PINGED!`
                        });
                    });
                }

                const mins = String(Math.floor(room.pingTimeLeft / 60)).padStart(2, '0');
                const secs = String(room.pingTimeLeft % 60).padStart(2, '0');
                io.to(roomCode).emit('timer-update', { timeFormatted: `${mins}:${secs}` });

            }, 1000);
        }
    });

    // Strictly enforce that only players with cheatUnlocked = true can trigger a manual cheat ping
    socket.on('manual-ping', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players[socket.id];
        if (player && player.cheatUnlocked) {
            const activeRunners = Object.values(room.players).filter(p => p.role === 'runner' && p.status === 'active');
            activeRunners.forEach(runner => {
                io.to(roomCode).emit('runner-ping', {
                    lat: runner.lat,
                    lng: runner.lng,
                    runnerId: runner.id,
                    message: `⚡ CHEAT PING BY ${player.name.toUpperCase()}! ${runner.name.toUpperCase()} REVEALED!`
                });
            });
        }
    });

    socket.on('update-location', ({ roomCode, lat, lng }) => {
        if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id].lat = lat;
            rooms[roomCode].players[socket.id].lng = lng;

            socket.to(roomCode).emit('player-moved', {
                id: socket.id,
                lat,
                lng
            });
        }
    });

    socket.on('attempt-catch', ({ roomCode, seekerId, runnerId }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const seeker = room.players[seekerId];
        const runner = room.players[runnerId];

        if (seeker && runner && seeker.role === 'seeker' && runner.role === 'runner') {
            runner.status = 'caught';

            const activeRunners = Object.values(room.players).filter(p => p.role === 'runner' && p.status === 'active');

            if (activeRunners.length === 0) {
                io.to(roomCode).emit('update-players', room.players);
                io.to(roomCode).emit('game-over', {
                    winner: 'Seekers',
                    message: `${seeker.name.toUpperCase()} caught ${runner.name.toUpperCase()}! All runners eliminated! Seekers Win!`
                });
            } else {
                io.to(roomCode).emit('update-players', room.players);
                io.to(roomCode).emit('catch-failed', { 
                    message: `🎯 CAUGHT! ${seeker.name.toUpperCase()} captured ${runner.name.toUpperCase()}! ${activeRunners.length} runner(s) remaining.` 
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                io.to(roomCode).emit('update-players', rooms[roomCode].players);
                
                if (Object.keys(rooms[roomCode].players).length === 0) {
                    clearInterval(rooms[roomCode].pingTimer);
                    delete rooms[roomCode];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChronoChase server running on port ${PORT}`);
});