const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { body, validationResult } = require('express-validator');

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "ws://localhost:3001", "http://localhost:3001"]
        }
    }
}));

app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5500"],
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const rateLimiter = new RateLimiterMemory({
    points: 5, // Number of requests
    duration: 1, // Per 1 second
});

const messageRateLimiter = new RateLimiterMemory({
    points: 10, // Number of messages
    duration: 60, // Per 1 minute
});

// Socket.io setup with CORS
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5500"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// In-memory storage for rooms and users
const rooms = new Map();
const userSockets = new Map();

// Room structure:
// {
//   id: string,
//   name: string,
//   passwordHash: string,
//   participants: Map<socketId, {username, joinedAt}>,
//   createdAt: Date,
//   lastActivity: Date
// }

// Utility functions
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 1000); // Limit length and trim
}

function validateRoomName(name) {
    const trimmed = sanitizeInput(name);
    if (trimmed.length < 3 || trimmed.length > 50) {
        return { valid: false, error: 'Room name must be between 3 and 50 characters' };
    }
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
        return { valid: false, error: 'Room name contains invalid characters' };
    }
    return { valid: true, value: trimmed };
}

function validateUsername(username) {
    const trimmed = sanitizeInput(username);
    if (trimmed.length < 2 || trimmed.length > 20) {
        return { valid: false, error: 'Username must be between 2 and 20 characters' };
    }
    if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
        return { valid: false, error: 'Username contains invalid characters' };
    }
    return { valid: true, value: trimmed };
}

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
        return { valid: false, error: 'Password must be between 6 and 100 characters' };
    }
    return { valid: true, value: password };
}

function validateRoomId(roomId) {
    const trimmed = sanitizeInput(roomId);
    if (!/^[A-F0-9]{8}$/.test(trimmed)) {
        return { valid: false, error: 'Invalid room ID format' };
    }
    return { valid: true, value: trimmed };
}

// Clean up inactive rooms (older than 24 hours with no activity)
function cleanupInactiveRooms() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [roomId, room] of rooms.entries()) {
        if (now - room.lastActivity > maxAge || room.participants.size === 0) {
            rooms.delete(roomId);
            console.log(`Cleaned up inactive room: ${roomId}`);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupInactiveRooms, 60 * 60 * 1000);

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        activeRooms: rooms.size,
        connectedUsers: userSockets.size
    });
});

app.get('/api/room/:roomId/exists', async (req, res) => {
    try {
        await rateLimiter.consume(req.ip);

        const { roomId } = req.params;
        const validation = validateRoomId(roomId);

        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const room = rooms.get(validation.value);
        res.json({ exists: !!room });
    } catch (rejRes) {
        res.status(429).json({ error: 'Too many requests' });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    userSockets.set(socket.id, { socket, joinedAt: new Date() });

    // Handle room creation
    socket.on('create-room', async (data) => {
        try {
            await rateLimiter.consume(socket.handshake.address);

            const { roomName, password } = data;

            // Validate inputs
            const nameValidation = validateRoomName(roomName);
            if (!nameValidation.valid) {
                return socket.emit('create-room-error', { error: nameValidation.error });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return socket.emit('create-room-error', { error: passwordValidation.error });
            }

            // Generate room ID and hash password
            let roomId;
            do {
                roomId = generateRoomId();
            } while (rooms.has(roomId));

            const passwordHash = await hashPassword(passwordValidation.value);

            // Create room
            const room = {
                id: roomId,
                name: nameValidation.value,
                passwordHash,
                participants: new Map(),
                createdAt: new Date(),
                lastActivity: new Date()
            };

            rooms.set(roomId, room);

            socket.emit('room-created', {
                roomId,
                roomName: nameValidation.value,
                inviteLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?roomId=${roomId}`
            });

            console.log(`Room created: ${roomId} - ${nameValidation.value}`);

        } catch (rejRes) {
            socket.emit('create-room-error', { error: 'Rate limit exceeded' });
        }
    });

    // Handle room joining
    socket.on('join-room', async (data) => {
        try {
            await rateLimiter.consume(socket.handshake.address);

            const { roomId, password, username } = data;

            // Validate inputs
            const roomIdValidation = validateRoomId(roomId);
            if (!roomIdValidation.valid) {
                return socket.emit('join-room-error', { error: roomIdValidation.error });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return socket.emit('join-room-error', { error: passwordValidation.error });
            }

            const usernameValidation = validateUsername(username);
            if (!usernameValidation.valid) {
                return socket.emit('join-room-error', { error: usernameValidation.error });
            }

            // Check if room exists
            const room = rooms.get(roomIdValidation.value);
            if (!room) {
                return socket.emit('join-room-error', { error: 'Room not found' });
            }

            // Verify password
            const passwordMatch = await verifyPassword(passwordValidation.value, room.passwordHash);
            if (!passwordMatch) {
                return socket.emit('join-room-error', { error: 'Invalid password' });
            }

            // Check if username is already taken in this room
            for (const participant of room.participants.values()) {
                if (participant.username.toLowerCase() === usernameValidation.value.toLowerCase()) {
                    return socket.emit('join-room-error', { error: 'Username already taken in this room' });
                }
            }

            // Add user to room
            socket.join(roomIdValidation.value);
            room.participants.set(socket.id, {
                username: usernameValidation.value,
                joinedAt: new Date()
            });
            room.lastActivity = new Date();

            // Update user socket info
            const userInfo = userSockets.get(socket.id);
            if (userInfo) {
                userInfo.roomId = roomIdValidation.value;
                userInfo.username = usernameValidation.value;
            }

            // Send success response
            socket.emit('joined-room', {
                roomId: roomIdValidation.value,
                roomName: room.name,
                username: usernameValidation.value,
                participants: Array.from(room.participants.values()).map(p => p.username)
            });

            // Notify other participants
            socket.to(roomIdValidation.value).emit('user-joined', {
                username: usernameValidation.value,
                participants: Array.from(room.participants.values()).map(p => p.username)
            });

            console.log(`User ${usernameValidation.value} joined room ${roomIdValidation.value}`);

        } catch (rejRes) {
            socket.emit('join-room-error', { error: 'Rate limit exceeded' });
        }
    });

    // Handle sending messages
    socket.on('send-message', async (data) => {
        try {
            await messageRateLimiter.consume(socket.handshake.address);

            const { roomId, encryptedMessage, timestamp } = data;

            // Validate inputs
            const roomIdValidation = validateRoomId(roomId);
            if (!roomIdValidation.valid) {
                return socket.emit('message-error', { error: roomIdValidation.error });
            }

            const room = rooms.get(roomIdValidation.value);
            if (!room) {
                return socket.emit('message-error', { error: 'Room not found' });
            }

            const participant = room.participants.get(socket.id);
            if (!participant) {
                return socket.emit('message-error', { error: 'You are not in this room' });
            }

            // Validate encrypted message
            if (!encryptedMessage || typeof encryptedMessage !== 'object') {
                return socket.emit('message-error', { error: 'Invalid message format' });
            }

            if (!encryptedMessage.data || !encryptedMessage.iv) {
                return socket.emit('message-error', { error: 'Invalid encrypted message' });
            }

            // Update room activity
            room.lastActivity = new Date();

            // Broadcast encrypted message to all participants in the room
            const messageData = {
                id: uuidv4(),
                username: participant.username,
                encryptedMessage,
                timestamp: timestamp || new Date().toISOString(),
                roomId: roomIdValidation.value
            };

            io.to(roomIdValidation.value).emit('new-message', messageData);

            console.log(`Message sent in room ${roomIdValidation.value} by ${participant.username}`);

        } catch (rejRes) {
            socket.emit('message-error', { error: 'Message rate limit exceeded' });
        }
    });

    // Handle typing indicators
    socket.on('typing-start', async (data) => {
        try {
            const { roomId } = data;

            const roomIdValidation = validateRoomId(roomId);
            if (!roomIdValidation.valid) return;

            const room = rooms.get(roomIdValidation.value);
            if (!room) return;

            const participant = room.participants.get(socket.id);
            if (!participant) return;

            socket.to(roomIdValidation.value).emit('user-typing', {
                username: participant.username,
                typing: true
            });

        } catch (error) {
            console.error('Typing indicator error:', error);
        }
    });

    socket.on('typing-stop', async (data) => {
        try {
            const { roomId } = data;

            const roomIdValidation = validateRoomId(roomId);
            if (!roomIdValidation.valid) return;

            const room = rooms.get(roomIdValidation.value);
            if (!room) return;

            const participant = room.participants.get(socket.id);
            if (!participant) return;

            socket.to(roomIdValidation.value).emit('user-typing', {
                username: participant.username,
                typing: false
            });

        } catch (error) {
            console.error('Typing indicator error:', error);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        const userInfo = userSockets.get(socket.id);
        if (userInfo && userInfo.roomId) {
            const room = rooms.get(userInfo.roomId);
            if (room) {
                const participant = room.participants.get(socket.id);
                if (participant) {
                    // Remove user from room
                    room.participants.delete(socket.id);
                    room.lastActivity = new Date();

                    // Notify other participants
                    socket.to(userInfo.roomId).emit('user-left', {
                        username: participant.username,
                        participants: Array.from(room.participants.values()).map(p => p.username)
                    });

                    console.log(`User ${participant.username} left room ${userInfo.roomId}`);
                }
            }
        }

        userSockets.delete(socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🔐 Secure Chat Server running on port ${PORT}`);
    console.log(`🌐 CORS enabled for: http://localhost:3000, http://127.0.0.1:3000`);
    console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});
