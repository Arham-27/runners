const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game state tracking
const players = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Initialize default player state
    players[socket.id] = {
        id: socket.id,
        name: `Player_${socket.id.substring(0, 4)}`,
        role: 'runner', // default role
        lat: 0,
        lon: 0,
        caught: false
    };

    // Broadcast updated player list
    io.emit('updatePlayers', players);

    // Handle player position updates
    socket.on('updatePosition', (data) => {
        if (players[socket.id]) {
            players[socket.id].lat = data.lat;
            players[socket.id].lon = data.lon;
            players[socket.id].name = data.name || players[socket.id].name;
            io.emit('updatePlayers', players);
        }
    });

    // Handle role assignment
    socket.on('setRole', (role) => {
        if (players[socket.id]) {
            players[socket.id].role = role;
            io.emit('updatePlayers', players);
        }
    });

    // Handle manual cheat ping with passcode validation (CHASE2026)
    socket.on('requestCheatPing', ({ passcode }) => {
        if (passcode === 'CHASE2026') {
            // Broadcast global cheat ping to all players
            io.emit('globalPing', {
                senderId: socket.id,
                lat: players[socket.id]?.lat,
                lon: players[socket.id]?.lon,
                name: players[socket.id]?.name
            });
        } else {
            socket.emit('pingError', 'Invalid passcode! Cheat ping denied.');
        }
    });

    // Handle Seeker catching a Runner
    socket.on('catchRunner', ({ runnerId }) => {
        const seeker = players[socket.id];
        const runner = players[runnerId];

        // Validate that the catcher is a seeker and target is an active runner
        if (seeker && seeker.role === 'seeker' && runner && runner.role === 'runner' && !runner.caught) {
            runner.caught = true;

            // 1. Broadcast catch notification
            io.emit('gameNotification', `${runner.name} has been caught!`);
            io.emit('updatePlayers', players);

            // 2. Check if any active (uncaught) runners are left
            const activeRunners = Object.values(players).filter(p => p.role === 'runner' && !p.caught);

            if (activeRunners.length === 0) {
                // 3. Trigger Game Over and reset to lobby after 3 seconds
                io.emit('gameOver', 'Game Over! All runners have been caught by the Seekers.');

                setTimeout(() => {
                    for (let id in players) {
                        players[id].caught = false;
                        players[id].role = 'runner'; // Reset roles/lobby state
                    }
                    io.emit('returnToLobby');
                    io.emit('updatePlayers', players);
                }, 3000);
            }
        }
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChronoChase server running on port ${PORT}`);
});