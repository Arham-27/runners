const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store players grouped by room
const rooms = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Default player state
    socket.data = {
        id: socket.id,
        name: `Player_${socket.id.substring(0, 4)}`,
        room: 'CHASE01',
        role: 'runner',
        lat: 0,
        lon: 0,
        caught: false
    };

    // Handle joining a specific room
    socket.on('joinRoom', ({ room, name, role }) => {
        if (room) {
            socket.leave(socket.data.room);
            socket.data.room = room.toUpperCase();
            socket.join(socket.data.room);
        }
        if (name) socket.data.name = name;
        if (role) socket.data.role = role;

        if (!rooms[socket.data.room]) {
            rooms[socket.data.room] = {};
        }
        rooms[socket.data.room][socket.id] = socket.data;

        // Broadcast updated players to everyone in this room
        io.to(socket.data.room).emit('updatePlayers', rooms[socket.data.room]);
    });

    // Handle position updates
    socket.on('updatePosition', (data) => {
        if (rooms[socket.data.room] && rooms[socket.data.room][socket.id]) {
            rooms[socket.data.room][socket.id].lat = data.lat;
            rooms[socket.data.room][socket.id].lon = data.lon;
            if (data.name) rooms[socket.data.room][socket.id].name = data.name;

            io.to(socket.data.room).emit('updatePlayers', rooms[socket.data.room]);
        }
    });

    // Handle role changes
    socket.on('setRole', (role) => {
        if (rooms[socket.data.room] && rooms[socket.data.room][socket.id]) {
            rooms[socket.data.room][socket.id].role = role;
            io.to(socket.data.room).emit('updatePlayers', rooms[socket.data.room]);
        }
    });

    // Handle secure manual cheat ping (Passcode: CHASE2026)
    socket.on('requestCheatPing', ({ passcode }) => {
        if (passcode === 'CHASE2026') {
            io.to(socket.data.room).emit('globalPing', {
                senderId: socket.id,
                lat: socket.data.lat,
                lon: socket.data.lon,
                name: socket.data.name
            });
        } else {
            socket.emit('pingError', 'Invalid passcode! Cheat ping denied.');
        }
    });

    // Handle Seeker catching a Runner
    socket.on('catchRunner', ({ runnerId }) => {
        const roomPlayers = rooms[socket.data.room];
        if (!roomPlayers) return;

        const seeker = roomPlayers[socket.id];
        const runner = roomPlayers[runnerId];

        if (seeker && seeker.role === 'seeker' && runner && runner.role === 'runner' && !runner.caught) {
            runner.caught = true;

            io.to(socket.data.room).emit('gameNotification', `${runner.name} has been caught!`);
            io.to(socket.data.room).emit('updatePlayers', roomPlayers);

            // Check if any active runners are left in the room
            const activeRunners = Object.values(roomPlayers).filter(p => p.role === 'runner' && !p.caught);

            if (activeRunners.length === 0) {
                io.to(socket.data.room).emit('gameOver', 'Game Over! All runners have been caught.');

                setTimeout(() => {
                    for (let id in roomPlayers) {
                        roomPlayers[id].caught = false;
                        roomPlayers[id].role = 'runner';
                    }
                    io.to(socket.data.room).emit('returnToLobby');
                    io.to(socket.data.room).emit('updatePlayers', roomPlayers);
                }, 3000);
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const roomName = socket.data.room;
        if (rooms[roomName] && rooms[roomName][socket.id]) {
            delete rooms[roomName][socket.id];
            io.to(roomName).emit('updatePlayers', rooms[roomName]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChronoChase server running on port ${PORT}`);
});