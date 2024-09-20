

//index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const THROTTLE_DISTANCE = 2;  // Minimum movement before sending an update
const BASE_PROXIMITY_THRESHOLD = 50;  // Distance threshold for automatic flame return
const gameState = {
    players: {},
    flames: [],
    obstacles: [], // Add obstacles dynamically
    teamScores: { green: 0, purple: 0 },
    timeLeft: 300 // Game lasts for 300 seconds (5 minutes)
};

// Serve the game client
app.use(express.static('public'));

// Function to generate random positions
function randomPosition() {
    return { x: Math.random() * 800, y: Math.random() * 600 };
}

// Function to check if a position overlaps with an obstacle
function isInsideObstacle(position, obstacles) {
    return obstacles.some(obstacle => {
        return position.x + 15 > obstacle.x &&
               position.x - 15 < obstacle.x + obstacle.width &&
               position.y + 15 > obstacle.y &&
               position.y - 15 < obstacle.y + obstacle.height;
    });
}

// Function to generate flames that don't spawn inside obstacles
function createFlames(count = 10, obstacles) {
    const flames = [];
    while (flames.length < count) {
        let position = randomPosition();
        // Ensure the flame is not inside an obstacle
        while (isInsideObstacle(position, obstacles)) {
            position = randomPosition(); // Regenerate position if it's inside an obstacle
        }
        flames.push({ ...position, id: flames.length });
    }
    return flames;
}

// Function to place the player at their team base
function getTeamBase(team) {
    if (team === 'green') {
        return { x: 50, y: 50 }; // Green team starts in the top-left corner
    } else if (team === 'purple') {
        return { x: 750, y: 550 }; // Purple team starts in the bottom-right corner
    }
}

// Function to check if the player is near their base
function isPlayerNearBase(player) {
    const basePosition = getTeamBase(player.team);
    const distance = Math.hypot(player.position.x - basePosition.x, player.position.y - basePosition.y);
    return distance < BASE_PROXIMITY_THRESHOLD;
}

// Function to generate obstacles near the center
function createObstacles() {
    const obstacles = [];

    while (obstacles.length < 3) {  // Generate 3 obstacles
        const obstacle = {
            x: Math.random() * 400 + 200, // Keep obstacles near the center (200-600 on x-axis)
            y: Math.random() * 200 + 200, // Keep obstacles near the center (200-400 on y-axis)
            width: Math.random() * 60 + 40, // Randomize size
            height: Math.random() * 60 + 40 // Randomize size
        };

        // Ensure obstacles aren't placed too close to the player bases
        const distanceFromGreenBase = Math.hypot(obstacle.x - 50, obstacle.y - 50);
        const distanceFromPurpleBase = Math.hypot(obstacle.x - 750, obstacle.y - 550);

        if (distanceFromGreenBase > 200 && distanceFromPurpleBase > 200) {
            obstacles.push(obstacle);
        }
    }
    return obstacles;
}

// Initialize flames and obstacles on the map
gameState.obstacles = createObstacles();
gameState.flames = createFlames(20, gameState.obstacles);

io.on('connection', (socket) => {
    console.log('a player connected:', socket.id);

    // Assign player to a team
    const team = Object.keys(gameState.players).length % 2 === 0 ? 'green' : 'purple';
    gameState.players[socket.id] = {
        id: socket.id,
        team,
        flames: 0,
        position: getTeamBase(team),  // Place the player at their team base
        lastPosition: null  // Store the last known position
    };

    // Send current game state to the new player
    socket.emit('gameState', gameState);

    // Handle player movement and flame collection
    socket.on('move', (position) => {
        const player = gameState.players[socket.id];

        // Update position only if there's significant movement
        const distanceMoved = Math.hypot(position.x - player.position.x, position.y - player.position.y);
        if (distanceMoved > THROTTLE_DISTANCE) {
            player.position = position;
            player.lastPosition = position;

            // Check for flame collection
            gameState.flames = gameState.flames.filter(flame => {
                const distance = Math.hypot(flame.x - position.x, flame.y - position.y);
                if (distance < 20) { // Flame collected
                    player.flames++;
                    return false; // Remove the flame from the map
                }
                return true; // Keep the flame on the map
            });

            // Automatically return flames if the player is near their base
            if (player.flames > 0 && isPlayerNearBase(player)) {
                // Update the team's score
                gameState.teamScores[player.team] += player.flames;
                player.flames = 0; // Reset flame count
            }

            // Emit the updated game state to all players
            io.emit('gameState', gameState);
        }
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('gameState', gameState);
        console.log('a player disconnected:', socket.id);
    });
});

// Game loop to reduce time
setInterval(() => {
    if (gameState.timeLeft > 0) {
        gameState.timeLeft--;
        io.emit('timerUpdate', gameState.timeLeft);
    } else {
        io.emit('gameOver', gameState.teamScores);
    }
}, 1000); // 1 second intervals

server.listen(3000, () => {
    console.log('listening on *:3000');
});
