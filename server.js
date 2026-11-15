// Connect directly to your live Render backend
const socket = io('https://runandseek.onrender.com', {
    transports: ['websocket', 'polling']
});

let myRoom = 'CHASE01';
let myRole = 'seeker'; // or 'runner' based on your UI selection
let currentPlayers = [];

// DOM Elements
const roomDisplay = document.getElementById('room-display');
const roleDisplay = document.getElementById('role-display');
const timerDisplay = document.getElementById('next-ping-timer') || document.querySelector('.next-ping') || document.getElementById('ping-timer');

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    
    // Auto-join room on connection
    socket.emit('joinRoom', {
        room: myRoom,
        name: `Player_${socket.id.substring(0, 4)}`,
        role: myRole
    });
});

// Receive and render player updates safely
socket.on('updatePlayers', (data) => {
    try {
        // Convert object or array safely so it never crashes
        currentPlayers = Array.isArray(data) ? data : Object.values(data || {});
        renderSidebar(currentPlayers);
        updateMapMarkers(currentPlayers);
    } catch (err) {
        console.error('Error handling player update:', err);
    }
});

// Render Operatives Sidebar
function renderSidebar(players) {
    try {
        const runnersContainer = document.querySelector('.runners-list') || document.getElementById('runners-list');
        const seekersContainer = document.querySelector('.seekers-list') || document.getElementById('seekers-list');

        let runnerHtml = '';
        let seekerHtml = '';

        players.forEach(p => {
            const displayName = `${p.name || 'Operative'} ${p.id === socket.id ? '(You)' : ''}`;
            const item = `<div class="operative-item ${p.caught ? 'caught' : ''}">${displayName} ${p.caught ? '[CAUGHT]' : ''}</div>`;
            
            if (p.role === 'runner') {
                runnerHtml += item;
            } else {
                seekerHtml += item;
            }
        });

        if (runnersContainer) runnersContainer.innerHTML = runnerHtml || '<div class="no-ops">No runners</div>';
        if (seekersContainer) seekersContainer.innerHTML = seekerHtml || '<div class="no-ops">No seekers</div>';
    } catch (err) {
        console.error('Error rendering sidebar:', err);
    }
}

// Map Marker Updates (Leaflet integration safety)
function updateMapMarkers(players) {
    if (typeof map === 'undefined' || typeof L === 'undefined') return;
    
    players.forEach(p => {
        if (p.lat && p.lon) {
            // Update or create player marker logic on your Leaflet map
            console.log(`Updating marker for ${p.name}: ${p.lat}, ${p.lon}`);
        }
    });
}

// Ping Countdown Timer (Guaranteed not to freeze)
let pingTimeRemaining = 300; // 5 minutes in seconds
setInterval(() => {
    try {
        pingTimeRemaining--;
        if (pingTimeRemaining < 0) pingTimeRemaining = 300; // Reset loop

        const minutes = Math.floor(pingTimeRemaining / 60).toString().padStart(2, '0');
        const seconds = (pingTimeRemaining % 60).toString().padStart(2, '0');

        // Update timer text if element exists
        const timerEl = document.querySelector('[data-timer]') || document.getElementById('next-ping') || document.querySelector('header');
        // Find timer text node or update specific element
        if (timerDisplay) {
            timerDisplay.innerText = `${minutes}:${seconds}`;
        }
    } catch (err) {
        // Silent catch to prevent script stoppage
    }
}, 1000);

// Geolocation tracking loop
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        const { latitude, longitude } = position.coords;
        socket.emit('updatePosition', {
            lat: latitude,
            lon: longitude,
            name: `Player_${socket.id.substring(0, 4)}`
        });
    }, (error) => {
        console.warn('Geolocation error:', error);
    }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
    });
}

// Catch runner trigger helper
window.catchTargetRunner = function(runnerId) {
    socket.emit('catchRunner', { runnerId });
};

// Global notifications
socket.on('gameNotification', (msg) => {
    alert(msg); // Replace with custom toast if you have one
});

socket.on('gameOver', (msg) => {
    alert(msg);
});

socket.on('returnToLobby', () => {
    console.log('Returned to lobby');
});