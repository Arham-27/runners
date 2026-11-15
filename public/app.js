document.addEventListener('DOMContentLoaded', () => {
    console.log("ChronoChase script initialized.");

    const socket = io();

    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');
    const joinBtn = document.getElementById('join-btn');
    const playerNameInput = document.getElementById('player-name');
    const roomCodeInput = document.getElementById('room-code');
    const playerRoleSelect = document.getElementById('player-role');
    const secretCodeInput = document.getElementById('secret-code');
    
    const hudRoom = document.getElementById('hud-room');
    const hudRole = document.getElementById('hud-role');
    const hudTimer = document.getElementById('hud-timer');
    const catchBtn = document.getElementById('catch-btn');
    const cheatPingBtn = document.getElementById('cheat-ping-btn');
    const alertBanner = document.getElementById('alert-banner');
    const runnersList = document.getElementById('runners-list');
    const seekersList = document.getElementById('seekers-list');
    
    const catchModal = document.getElementById('catch-modal');
    const runnersSelectList = document.getElementById('runners-select-list');
    const closeModalBtn = document.getElementById('close-modal-btn');

    let map;
    let myMarker;
    let markers = {};
    let roomCode = '';
    let myRole = '';
    let playersData = {};
    let cheatUnlocked = false;

    const SECRET_CHEAT_PASSCODE = 'CHASE2026';

    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            console.log("Initialize button clicked!");

            const playerName = playerNameInput && playerNameInput.value.trim() ? playerNameInput.value.trim() : 'Agent';
            roomCode = roomCodeInput && roomCodeInput.value.trim() ? roomCodeInput.value.trim().toUpperCase() : 'CHASE01';
            myRole = playerRoleSelect ? playerRoleSelect.value : 'runner';
            const enteredCode = secretCodeInput ? secretCodeInput.value.trim() : '';

            if (!roomCode) {
                alert('Please enter a room code');
                return;
            }

            cheatUnlocked = (enteredCode === SECRET_CHEAT_PASSCODE);

            // 1. Switch screens immediately so the UI responds instantly
            if (lobbyScreen) lobbyScreen.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden');
            
            if (hudRoom) hudRoom.textContent = roomCode;
            if (hudRole) hudRole.textContent = myRole.toUpperCase() + (cheatUnlocked ? ' [CHEAT UNLOCKED]' : '');

            if (myRole === 'seeker') {
                if (catchBtn) catchBtn.classList.remove('hidden');
                if (cheatPingBtn) cheatPingBtn.classList.remove('hidden');
            } else if (cheatUnlocked) {
                if (cheatPingBtn) cheatPingBtn.classList.remove('hidden');
            }

            // 2. Emit socket join event
            console.log(`Joining room ${roomCode} as ${myRole} with name ${playerName}, cheatUnlocked: ${cheatUnlocked}`);
            socket.emit('join-room', { roomCode, playerName, role: myRole, cheatUnlocked });

            // 3. Initialize map after a short delay to ensure DOM dimensions are ready
            setTimeout(() => {
                try {
                    initMap();
                } catch (err) {
                    console.error("Map initialization error:", err);
                }
            }, 200);
        });
    }

    function initMap() {
        if (map) return;

        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        map = L.map('map', {
            zoomControl: false
        }).setView([12.9716, 77.5946], 16);

        L.control.zoom({ position: 'topright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        setTimeout(() => {
            map.invalidateSize();
        }, 250);

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    if (!myMarker) {
                        const color = myRole === 'runner' ? '#da3633' : '#238636';
                        myMarker = L.circleMarker([lat, lng], {
                            radius: 10,
                            fillColor: color,
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        }).addTo(map).bindPopup(`You (${myRole.toUpperCase()})`).openPopup();
                        
                        map.setView([lat, lng], 17);
                    } else {
                        myMarker.setLatLng([lat, lng]);
                    }

                    socket.emit('update-location', { roomCode, lat, lng });
                },
                (error) => {
                    console.warn('Geolocation warning:', error.message);
                },
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
            );
        }
    }

    function playBeep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
            console.log("Audio restricted:", e);
        }
    }

    socket.on('update-players', (players) => {
        console.log("Players update received:", players);
        playersData = players;
        if (runnersList) runnersList.innerHTML = '';
        if (seekersList) seekersList.innerHTML = '';

        for (const id in players) {
            const p = players[id];
            const isMe = (id === socket.id);
            const displayName = p.name.toUpperCase() + (isMe ? ' (You)' : '');
            
            const color = p.role === 'runner' ? '#da3633' : '#238636';

            const li = document.createElement('li');
            li.textContent = displayName;
            if (p.status === 'caught') {
                li.classList.add('caught');
                li.textContent += ' [CAUGHT]';
            }

            if (p.role === 'runner') {
                if (runnersList) runnersList.appendChild(li);
            } else {
                if (seekersList) seekersList.appendChild(li);
            }

            // Stealth Logic: Teammates see each other live, opposing players are hidden from map
            if (map && !isMe) {
                const isTeammate = (p.role === myRole);

                if (isTeammate) {
                    if (!markers[id]) {
                        markers[id] = L.circleMarker([p.lat, p.lng], {
                            radius: 8,
                            fillColor: color,
                            color: '#fff',
                            weight: 1,
                            fillOpacity: 0.8
                        }).addTo(map).bindPopup(`${p.name.toUpperCase()} (${p.role})`);
                    } else {
                        markers[id].setLatLng([p.lat, p.lng]);
                    }
                } else {
                    if (markers[id]) {
                        map.removeLayer(markers[id]);
                        delete markers[id];
                    }
                }
            }
        }

        if (map) {
            for (const id in markers) {
                if (!players[id]) {
                    map.removeLayer(markers[id]);
                    delete markers[id];
                }
            }
        }
    });

    socket.on('player-moved', ({ id, lat, lng }) => {
        if (markers[id]) {
            markers[id].setLatLng([lat, lng]);
        }
    });

    socket.on('runner-ping', ({ lat, lng, message }) => {
        showAlert(message);

        if (myRole === 'runner') {
            playBeep();
        } else if (myRole === 'seeker' || cheatUnlocked) {
            if (!map) return;
            const pingCircle = L.circle([lat, lng], {
                color: 'red',
                fillColor: '#da3633',
                fillOpacity: 0.5,
                radius: 40
            }).addTo(map);

            setTimeout(() => {
                map.removeLayer(pingCircle);
            }, 30000);
        }
    });

    socket.on('timer-update', ({ timeFormatted }) => {
        if (hudTimer) hudTimer.textContent = timeFormatted;
    });

    if (cheatPingBtn) {
        cheatPingBtn.addEventListener('click', () => {
            socket.emit('manual-ping', { roomCode });
        });
    }

    if (catchBtn) {
        catchBtn.addEventListener('click', () => {
            if (runnersSelectList) runnersSelectList.innerHTML = '';
            
            const activeRunners = Object.values(playersData).filter(p => p.role === 'runner' && p.status === 'active');
            
            if (activeRunners.length === 0) {
                alert('No active runners left to catch!');
                return;
            }

            activeRunners.forEach(runner => {
                const btn = document.createElement('button');
                btn.className = 'runner-select-btn';
                btn.textContent = `Catch ${runner.name.toUpperCase()}`;
                btn.addEventListener('click', () => {
                    socket.emit('attempt-catch', {
                        roomCode,
                        seekerId: socket.id,
                        runnerId: runner.id
                    });
                    if (catchModal) catchModal.classList.add('hidden');
                });
                if (runnersSelectList) runnersSelectList.appendChild(btn);
            });

            if (catchModal) catchModal.classList.remove('hidden');
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (catchModal) catchModal.classList.add('hidden');
        });
    }

    socket.on('catch-failed', ({ message }) => {
        showAlert(message);
    });

    socket.on('game-over', ({ winner, message }) => {
        alert(`GAME OVER! Winner: ${winner}\n${message}`);
        location.reload();
    });

    function showAlert(text) {
        if (!alertBanner) return;
        alertBanner.textContent = text;
        alertBanner.classList.remove('hidden');
        setTimeout(() => {
            alertBanner.classList.add('hidden');
        }, 5000);
    }
});