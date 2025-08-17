#!/bin/bash

# Opto Prospect Firebase Deployment Script
# This script deploys Firebase security rules and can optionally deploy hosting

set -e  # Exit on any error

echo "🔥 Firebase Deployment Script for Opto Prospect"
echo "================================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed."
    echo "📦 Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "🔐 You need to log in to Firebase first."
    echo "🚀 Run: firebase login"
    exit 1
fi

echo "✅ Firebase CLI is ready"

# Deploy Firestore rules
echo "📜 Deploying Firestore security rules..."
firebase deploy --only firestore:rules

echo "📊 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

echo "✅ Firebase rules and indexes deployed successfully!"

# Ask if user wants to deploy hosting too
read -p "🌐 Do you want to deploy hosting as well? (y/n): " deploy_hosting

if [[ $deploy_hosting =~ ^[Yy]$ ]]; then
    echo "🏗️  Building Next.js application..."
    cd web
    npm run build
    npm run export
    cd ..
    
    echo "🚀 Deploying to Firebase Hosting..."
    firebase deploy --only hosting
    
    echo "🎉 Full deployment completed!"
    echo "🔗 Your app should be available at your Firebase hosting URL"
else
    echo "✅ Security rules deployment completed!"
    echo "ℹ️  You can deploy hosting later with: firebase deploy --only hosting"
fi

echo "🎯 Next steps:"
echo "1. Verify your Firebase security rules in the Firebase Console"
echo "2. Test authentication and data access"
echo "3. Set up your production domain and SSL"
echo "4. Configure Google Maps API restrictions"
