#!/bin/bash
# Android setup script for Regroove Meister

set -e

echo "🤖 Regroove Meister - Android Setup"
echo "===================================="
echo ""

# Check if Android SDK is installed
if ! command -v adb &> /dev/null; then
    echo "⚠️  Android SDK not found!"
    echo "   Please install Android Studio first:"
    echo "   https://developer.android.com/studio"
    echo ""
    read -p "Press Enter after installing Android Studio..."
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Check if Android platform exists
if [ ! -d "android" ]; then
    echo "🔧 Setting up Android platform..."
    echo ""
    echo "You will be prompted for app details:"
    echo "  App name: Regroove Meister"
    echo "  App ID: nl.gbraad.meister"
    echo "  Web directory: . (dot - current directory)"
    echo ""
    read -p "Press Enter to continue..."

    # Initialize Capacitor (only if not done)
    if [ ! -f "capacitor.config.ts" ]; then
        npx cap init "Regroove Meister" "nl.gbraad.meister" --web-dir=.
    fi

    # Add Android platform
    npx cap add android

    if [ $? -ne 0 ]; then
        echo "❌ Failed to add Android platform"
        exit 1
    fi

    echo "✅ Android platform added"
else
    echo "✓ Android platform already exists"
fi

# Sync web code to Android
echo ""
echo "📱 Syncing web code to Android..."
npx cap sync

echo ""
echo "✅ Android setup complete!"
echo ""
echo "Next steps:"
echo "  1. Open Android Studio: npm run cap:open:android"
echo "  2. Click Run ▶ to test on device/emulator"
echo "  3. Or Build → Generate Signed APK for release"
echo ""
echo "See ANDROID.md for full documentation"
