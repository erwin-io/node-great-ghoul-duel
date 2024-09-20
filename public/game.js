//game.js
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let playerState = {};
let gameState = { players: {}, flames: [] };
let playerId;
let moveDirection = { x: 0, y: 0 };

let targetPosition = null;
let lastClickTime = 0;
const CLICK_DEBOUNCE_DELAY = 100;  // 100ms delay between clicks
let lastSentPosition = { x: 0, y: 0 };
const THROTTLE_DISTANCE = 2;  // Minimum movement before sending an update
const UPDATE_INTERVAL = 100; // Throttle updates to 10 times per second
let lastUpdateTime = 0;

// Map boundaries
const mapBoundaries = {
    xMin: 0,
    xMax: canvas.width,
    yMin: 0,
    yMax: canvas.height
};

// Update game state from the server
socket.on('gameState', (state) => {
    gameState = state;
    playerId = socket.id;
    drawGame();
});

// Update timer
socket.on('timerUpdate', (timeLeft) => {
    document.getElementById('timer').innerText = timeLeft;
});

// Handle game over
socket.on('gameOver', (scores) => {
    alert(`Game Over! Green: ${scores.green}, Purple: ${scores.purple}`);
    location.reload(); // Reload the game
});

// Throttle position updates
function sendPositionUpdate(playerPosition) {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime > UPDATE_INTERVAL) {
        socket.emit('move', playerPosition);
        lastUpdateTime = currentTime;
    }
}

// Move player based on arrow keys
document.addEventListener('keydown', (event) => {
    targetPosition = null;  // Clear mouse target when keyboard input is used

    switch (event.key) {
        case 'ArrowUp':
            moveDirection.y = -1;
            break;
        case 'ArrowDown':
            moveDirection.y = 1;
            break;
        case 'ArrowLeft':
            moveDirection.x = -1;
            break;
        case 'ArrowRight':
            moveDirection.x = 1;
            break;
    }
});

// Stop movement when arrow keys are released
document.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
            moveDirection.y = 0;
            break;
        case 'ArrowLeft':
        case 'ArrowRight':
            moveDirection.x = 0;
            break;
    }
});

// Handle mouse movement (click-to-move)
canvas.addEventListener('mousedown', (event) => {
    const currentTime = Date.now();
    if (currentTime - lastClickTime < CLICK_DEBOUNCE_DELAY) return;

    lastClickTime = currentTime;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    targetPosition = { x: mouseX, y: mouseY };
});

// Smooth movement towards the target position
function moveTowardTarget(player) {
    if (!targetPosition) return;

    const dx = targetPosition.x - player.position.x;
    const dy = targetPosition.y - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 1) {
        const step = 5;  // Speed of movement
        const angle = Math.atan2(dy, dx);
        const moveX = Math.cos(angle) * step;
        const moveY = Math.sin(angle) * step;

        player.position.x += moveX;
        player.position.y += moveY;

        player.position.x = Math.max(mapBoundaries.xMin, Math.min(player.position.x, mapBoundaries.xMax - 15));
        player.position.y = Math.max(mapBoundaries.yMin, Math.min(player.position.y, mapBoundaries.yMax - 15));

        // Send position update with throttling
        sendPositionUpdate(player.position);
    } else {
        targetPosition = null;
    }
}

// Update game loop to handle movement
function gameLoop() {
    const player = gameState.players[playerId];

    if (moveDirection.x !== 0 || moveDirection.y !== 0) {
        let newPosition = {
            x: player.position.x + moveDirection.x * 5,
            y: player.position.y + moveDirection.y * 5,
        };

        newPosition.x = Math.max(mapBoundaries.xMin, Math.min(newPosition.x, mapBoundaries.xMax - 15));
        newPosition.y = Math.max(mapBoundaries.yMin, Math.min(newPosition.y, mapBoundaries.yMax - 15));

        sendPositionUpdate(newPosition);
        player.position = newPosition;
    } else {
        moveTowardTarget(player);
    }

    drawGame();
    requestAnimationFrame(gameLoop);
}

// Draw the game elements
function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw obstacles
    if(gameState.obstacles) {
        gameState.obstacles.forEach(obstacle => {
            ctx.fillStyle = 'gray';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        });
    }

    // Draw flames
    gameState.flames.forEach(flame => {
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(flame.x, flame.y, 10, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw players
    Object.values(gameState.players).forEach(player => {
        ctx.fillStyle = player.team === 'green' ? 'green' : 'purple';
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, 15, 0, Math.PI * 2);
        ctx.fill();
    });

    // Update team scores
    document.getElementById('greenScore').innerText = gameState?.teamScores?.green || 0;
    document.getElementById('purpleScore').innerText = gameState?.teamScores?.purple || 0;
}

gameLoop();
