# Secure Chat Backend

A secure, encrypted chat application backend built with Node.js, Express, and Socket.IO featuring end-to-end encryption and robust security measures.

## Features

- 🔐 **End-to-End Encryption**: All messages encrypted client-side using AES-256-GCM
- 🔒 **Secure Room Management**: Password-protected rooms with bcrypt hashing
- 🚀 **Real-time Communication**: WebSocket-based messaging with Socket.IO
- 🛡️ **Security First**: Rate limiting, input validation, and security headers
- 👥 **Multi-room Support**: Multiple chat rooms running simultaneously
- 🔄 **Typing Indicators**: Real-time typing status updates
- 🧹 **Auto Cleanup**: Automatic cleanup of inactive rooms
- 📊 **Health Monitoring**: Health check endpoint for monitoring

## Security Features

### Encryption
- **Client-side encryption**: Messages encrypted before transmission
- **AES-256-GCM**: Industry-standard encryption algorithm
- **Key derivation**: PBKDF2 with 100,000 iterations
- **No server-side decryption**: Server never sees plaintext messages

### Authentication & Authorization
- **Password hashing**: bcrypt with 12 salt rounds
- **Room-based access control**: Users must provide correct room ID and password
- **Username validation**: Prevents impersonation within rooms

### Rate Limiting
- **Connection rate limiting**: 5 requests per second per IP
- **Message rate limiting**: 10 messages per minute per user
- **DDoS protection**: Automatic blocking of excessive requests

### Input Validation & Sanitization
- **Strict validation**: All inputs validated against defined patterns
- **Length limits**: Prevents buffer overflow and resource exhaustion
- **XSS prevention**: Input sanitization and output encoding

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd secure-chat-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment (development/production) | development |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `BCRYPT_ROUNDS` | bcrypt hash rounds | 12 |

## API Endpoints

### Health Check
- **GET** `/api/health` - Server health and statistics

### Room Information
- **GET** `/api/room/:roomId/exists` - Check if room exists

## Socket Events

### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `create-room` | Create a new room | `{roomName, password}` |
| `join-room` | Join existing room | `{roomId, password, username}` |
| `send-message` | Send encrypted message | `{roomId, encryptedMessage, timestamp}` |
| `typing-start` | Start typing indicator | `{roomId}` |
| `typing-stop` | Stop typing indicator | `{roomId}` |

### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `room-created` | Room creation success | `{roomId, roomName, inviteLink}` |
| `joined-room` | Room join success | `{roomId, roomName, username, participants}` |
| `new-message` | New encrypted message | `{id, username, encryptedMessage, timestamp, roomId}` |
| `user-joined` | User joined room | `{username, participants}` |
| `user-left` | User left room | `{username, participants}` |
| `user-typing` | Typing indicator | `{username, typing}` |

## Data Models

### Room Structure
```javascript
{
  id: string,           // 8-character hex ID
  name: string,         // Room display name
  passwordHash: string, // bcrypt hash of password
  participants: Map,    // Active participants
  createdAt: Date,      // Creation timestamp
  lastActivity: Date    // Last activity timestamp
}
```

### Participant Structure
```javascript
{
  username: string,     // User display name
  joinedAt: Date       // Join timestamp
}
```

## Security Considerations

### Production Deployment
1. **Use HTTPS**: Always use SSL/TLS in production
2. **Environment Variables**: Store sensitive data in environment variables
3. **Rate Limiting**: Adjust rate limits based on expected traffic
4. **Monitoring**: Implement logging and monitoring
5. **Updates**: Keep dependencies updated

### Network Security
- Configure firewall rules
- Use reverse proxy (nginx/Apache)
- Enable CORS for specific origins only
- Consider implementing IP whitelisting

## Development

### File Structure
```
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

### Adding Features
1. **New socket events**: Add handlers in the socket connection section
2. **API endpoints**: Add Express routes before the error handling middleware
3. **Validation**: Add validation functions for new data types
4. **Security**: Always consider security implications of new features

## Troubleshooting

### Common Issues

**Port already in use**
```bash
# Find process using port 3001
lsof -ti:3001
# Kill the process
kill -9 <PID>
```

**CORS errors**
- Ensure FRONTEND_URL matches your frontend URL exactly
- Check that frontend is running on expected port

**Connection refused**
- Verify server is running
- Check firewall settings
- Ensure WebSocket connections are allowed

### Logging
Server logs include:
- Room creation/deletion events
- User join/leave events
- Message transmission (encrypted)
- Security events (rate limiting, validation errors)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with security in mind
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check this README
2. Review server logs
3. Test with health check endpoint
4. Create an issue with detailed information
