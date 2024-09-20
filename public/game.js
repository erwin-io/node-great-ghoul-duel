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

// Move player based on arrow keys
document.addEventListener('keydown', (event) => {
    // Clear mouse target when keyboard input is used
    targetPosition = null;

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
    if (currentTime - lastClickTime < CLICK_DEBOUNCE_DELAY) return; // Ignore click if within debounce delay

    lastClickTime = currentTime;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Set target position for the player to move toward
    targetPosition = { x: mouseX, y: mouseY };
});

function moveTowardTarget(player) {
    if (!targetPosition) return;

    const dx = targetPosition.x - player.position.x;
    const dy = targetPosition.y - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 1) {
        const step = 5; // Speed of movement
        const angle = Math.atan2(dy, dx);
        const moveX = Math.cos(angle) * step;
        const moveY = Math.sin(angle) * step;

        // Move the player
        player.position.x += moveX;
        player.position.y += moveY;

        // Ensure player doesn't move outside map boundaries
        player.position.x = Math.max(mapBoundaries.xMin, Math.min(player.position.x, mapBoundaries.xMax - 15));
        player.position.y = Math.max(mapBoundaries.yMin, Math.min(player.position.y, mapBoundaries.yMax - 15));

        // Check for collisions with obstacles and adjust movement
        const canMoveX = !checkObstacleCollision({ ...player.position, y: player.position.y });
        const canMoveY = !checkObstacleCollision({ ...player.position, x: player.position.x });

        if (!canMoveX) player.position.x -= moveX;
        if (!canMoveY) player.position.y -= moveY;

        // Throttle server position updates to avoid jittering
        const movedEnough = Math.hypot(player.position.x - lastSentPosition.x, player.position.y - lastSentPosition.y) > THROTTLE_DISTANCE;
        if (movedEnough) {
            // Emit the updated position to the server only when significant movement occurs
            socket.emit('move', player.position);
            lastSentPosition = { ...player.position };
        }
    } else {
        targetPosition = null; // Stop moving when target is reached
    }
}

// Update gameLoop to include mouse movement
function gameLoop() {
    const player = gameState.players[playerId];

    // Handle keyboard movement if any direction is pressed
    if (moveDirection.x !== 0 || moveDirection.y !== 0) {
        let newPosition = {
            x: player.position.x + moveDirection.x * 5,
            y: player.position.y + moveDirection.y * 5,
        };

        // Ensure player doesn't move outside the map boundaries
        newPosition.x = Math.max(mapBoundaries.xMin, Math.min(newPosition.x, mapBoundaries.xMax - 15));
        newPosition.y = Math.max(mapBoundaries.yMin, Math.min(newPosition.y, mapBoundaries.yMax - 15));

        // Check for obstacle collisions separately on X and Y axes
        const canMoveX = !checkObstacleCollision({ ...newPosition, y: player.position.y });
        const canMoveY = !checkObstacleCollision({ ...newPosition, x: player.position.x });

        // Adjust position if there are no collisions
        if (canMoveX) player.position.x = newPosition.x;
        if (canMoveY) player.position.y = newPosition.y;

        // Emit the updated position
        socket.emit('move', player.position);
    } else {
        // Handle mouse movement if no keyboard direction is active
        moveTowardTarget(player);
    }

    // Redraw the game state
    drawGame();
    requestAnimationFrame(gameLoop);
}

// Collision detection with other players
function checkPlayerCollision(newPosition, playerId) {
    return Object.values(gameState.players).some((otherPlayer) => {
        if (otherPlayer.id !== playerId) {
            const distance = Math.hypot(newPosition.x - otherPlayer.position.x, newPosition.y - otherPlayer.position.y);
            return distance < 30; // Collision detected if players are within 30px of each other
        }
        return false;
    });
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw obstacles
    if (gameState.obstacles) {
        gameState.obstacles.forEach((obstacle) => {
            ctx.fillStyle = 'gray';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        });
    }

    // Draw flames
    gameState.flames.forEach((flame) => {
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(flame.x, flame.y, 10, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw players
    Object.values(gameState.players).forEach((player) => {
        ctx.fillStyle = player.team === 'green' ? 'green' : 'purple';
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, 15, 0, Math.PI * 2);
        ctx.fill();
    });

    // Update team scores on the UI
    if (gameState.teamScores) {
        document.getElementById('greenScore').innerText = gameState.teamScores.green || 0;
        document.getElementById('purpleScore').innerText = gameState.teamScores.purple || 0;
    }
}

function checkObstacleCollision(newPosition) {
    return gameState.obstacles.some(obstacle => {
        return newPosition.x + 15 > obstacle.x &&
               newPosition.x - 15 < obstacle.x + obstacle.width &&
               newPosition.y + 15 > obstacle.y &&
               newPosition.y - 15 < obstacle.y + obstacle.height;
    });
}

// Start game loop
gameLoop();
