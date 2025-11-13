#!/bin/bash

# Build script for Gmail Carbon Score extension

set -e

echo "🧹 Cleaning old build..."
rm -rf dist
rm -f gmail-carbon-score.zip

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling TypeScript..."
npm run compile

echo "📋 Copying static files..."
npm run copy

echo "🗜️  Creating zip archive..."
npm run zip

echo "✅ Build complete! Archive created: gmail-carbon-score.zip"
echo "📦 You can now load the extension from the 'dist' folder or use the zip file"
