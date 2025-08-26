#!/bin/bash

# Secure Chat Backend Deployment Script

echo "🚀 Starting Secure Chat Backend Deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your configuration"
fi

# Create logs directory
mkdir -p logs

# Check Node.js version
NODE_VERSION=$(node --version)
echo "🟢 Node.js version: $NODE_VERSION"

# Start the server
echo "🔐 Starting Secure Chat Backend..."
echo "🌐 Server will be available at: http://localhost:3001"
echo "📊 Health check: http://localhost:3001/api/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start in development mode if nodemon is available, otherwise use node
if command -v nodemon &> /dev/null; then
    npm run dev
else
    npm start
fi
