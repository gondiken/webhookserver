const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Store connected SSE clients
let clients = [];

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Server-Sent Events endpoint
app.get('/events', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add client to list
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        response: res
    };
    clients.push(newClient);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ message: 'Connected to real-time updates' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
        console.log(`Client ${clientId} disconnected`);
    });
});

// Main webhook endpoint - this is where your SaaS will send data
app.post('/webhook', (req, res) => {
    const receivedData = req.body;
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] Received data:`, JSON.stringify(receivedData, null, 2));
    
    // Broadcast to all connected clients
    const message = {
        timestamp,
        body: receivedData,
        headers: req.headers,
        method: req.method,
        url: req.url
    };

    clients.forEach(client => {
        try {
            client.response.write(`data: ${JSON.stringify(message)}\n\n`);
        } catch (error) {
            console.error('Error sending to client:', error);
        }
    });

    // Send success response
    res.status(200).json({
        success: true,
        message: 'Data received successfully',
        timestamp,
        dataReceived: receivedData
    });
});

// Alternative GET endpoint for testing
app.get('/webhook', (req, res) => {
    res.json({
        message: 'Webhook endpoint is ready',
        instructions: 'Send POST requests to this endpoint with JSON data',
        endpoint: `http://localhost:${PORT}/webhook`
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connectedClients: clients.length
    });
});

// Catch all other routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        availableEndpoints: {
            'GET /': 'Web interface',
            'POST /webhook': 'Main data endpoint',
            'GET /webhook': 'Endpoint info',
            'GET /health': 'Health check',
            'GET /events': 'Server-sent events'
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`\n📋 Instructions:`);
    console.log(`1. Open http://localhost:${PORT} in your browser`);
    console.log(`2. Configure your SaaS to send data to: http://localhost:${PORT}/webhook`);
    console.log(`3. Watch the data appear in real-time!\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    clients.forEach(client => {
        client.response.end();
    });
    process.exit(0);
});