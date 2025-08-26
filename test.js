// Simple test file for the secure chat backend
// Run with: node test.js

const http = require('http');

console.log('🧪 Testing Secure Chat Backend...');

// Test health endpoint
const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/health',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    },
};

const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('✅ Health Check Response:', response);

            if (response.status === 'healthy') {
                console.log('🟢 Backend is running correctly!');
            } else {
                console.log('🟡 Backend responded but status is not healthy');
            }
        } catch (error) {
            console.log('❌ Invalid JSON response:', data);
        }
    });
});

req.on('error', (error) => {
    console.log('❌ Error connecting to backend:', error.message);
    console.log('💡 Make sure the backend server is running on port 3001');
});

req.setTimeout(5000, () => {
    console.log('❌ Request timed out');
    req.destroy();
});

req.end();
