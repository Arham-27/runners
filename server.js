const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store players grouped by room, defaulting CHASE01
const rooms = {
    'CHASE01': {}
};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Automatically assign to default room CHASE01 on connection
    const defaultRoom = 'CHASE01';
    socket.join(defaultRoom);

    socket.data = {
        id: socket.id,
        name: `Player_${socket.id.substring(0, 4)}`,
        room: defaultRoom,
        role: 'runner',
        lat: 0,
        lon: 0,
        caught: false
    };

    if (!rooms[defaultRoom]) rooms[defaultRoom] = {};
    rooms[defaultRoom][socket.id] = socket.data;

    // Immediately broadcast player list so the sidebar populates instantly
    io.to(defaultRoom).emit('updatePlayers', rooms[defaultRoom]);

    // Handle explicit room switching if requested by UI
    socket.on('joinRoom', ({ room, name, role }) => {
        const targetRoom = (room || defaultRoom).toUpperCase();
        socket.leave(socket.data.room);
        delete rooms[socket.data.room]?.[socket.id];

        socket.data.room = targetRoom;
        socket.join(targetRoom);

        if (name) socket.data.name = name;
        if (role) socket.data.role = role;

        if (!rooms[targetRoom]) rooms[targetRoom] = {};
        rooms[targetRoom][socket.id] = socket.data;

        io.to(targetRoom).emit('updatePlayers', rooms[targetRoom]);
    });

    // Handle position updates
    socket.on('updatePosition', (data) => {
        const room = socket.data.room;
        if (rooms[room] && rooms[room][socket.id]) {
            rooms[room][socket.id].lat = data.lat;
            rooms[room][socket.id].lon = data.lon;
            if (data.name) rooms[room][socket.id].name = data.name;

            io.to(room).emit('updatePlayers', rooms[room]);
        }
    });

    // Handle role changes
    socket.on('setRole', (role) => {
        const room = socket.data.room;
        if (rooms[room] && rooms[room][socket.id]) {
            rooms[room][socket.id].role = role;
            io.to(room).emit('updatePlayers', rooms[room]);
        }
    });

    // Handle secure manual cheat ping (Passcode: CHASE2026)
    socket.on('requestCheatPing', ({ passcode }) => {
        const room = socket.data.room;
        if (passcode === 'CHASE2026') {
            io.to(room).emit('globalPing', {
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
        const room = socket.data.room;
        const roomPlayers = rooms[room];
        if (!roomPlayers) return;

        const seeker = roomPlayers[socket.id];
        const runner = roomPlayers[runnerId];

        if (seeker && seeker.role === 'seeker' && runner && runner.role === 'runner' && !runner.caught) {
            runner.caught = true;

            io.to(room).emit('gameNotification', `${runner.name} has been caught!`);
            io.to(room).emit('updatePlayers', roomPlayers);

            // Check if any active runners are left in the room
            const activeRunners = Object.values(roomPlayers).filter(p => p.role === 'runner' && !p.caught);

            if (activeRunners.length === 0) {
                io.to(room).emit('gameOver', 'Game Over! All runners have been caught.');

                setTimeout(() => {
                    for (let id in roomPlayers) {
                        roomPlayers[id].caught = false;
                        roomPlayers[id].role = 'runner';
                    }
                    io.to(room).emit('returnToLobby');
                    io.to(room).emit('updatePlayers', roomPlayers);
                }, 3000);
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const room = socket.data.room;
        if (rooms[room] && rooms[room][socket.id]) {
            delete rooms[room][socket.id];
            io.to(room).emit('updatePlayers', rooms[room]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChronoChase server running on port ${PORT}`);
});