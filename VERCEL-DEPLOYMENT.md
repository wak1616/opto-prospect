# 🚀 GitHub → Vercel Deployment Guide

Since you already have Vercel connected to your GitHub repository, deployment is simple!

## ✅ Pre-Deployment Checklist

### 1. Deploy Firebase Security Rules FIRST
**⚠️ CRITICAL: Do this before pushing to GitHub to avoid security exposure**

```bash
# Login to Firebase
cd /home/joaquin/opto-prospect/web
npx firebase login

# Initialize Firebase (if not already done)
npx firebase init firestore

# Deploy security rules
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

### 2. Environment Variables for Vercel
Make sure these are set in your **Vercel Dashboard**:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_api_key
NODE_ENV=production
```

## 🚀 Deployment Steps

### Step 1: Test Local Build
```bash
cd /home/joaquin/opto-prospect/web
NODE_ENV=production npm run build
```
✅ **Verified: Your build is working!**

### Step 2: Push to GitHub
```bash
cd /home/joaquin/opto-prospect
git add .
git commit -m "Production ready - Opto Prospect v1.0"
git push origin main
```

### Step 3: Vercel Auto-Deployment
- Vercel will automatically detect the push
- It will build and deploy your application
- You'll get a deployment URL

## 🔧 Post-Deployment Configuration

### After Vercel Gives You a URL:

#### 1. Update Firebase Authorized Domains
1. Go to [Firebase Console](https://console.firebase.google.com)
2. **Authentication** > **Settings** > **Authorized domains**
3. Add your Vercel URL (e.g., `your-app.vercel.app`)

#### 2. Update Google Maps API Restrictions
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** > **Credentials**
3. Edit your Maps API key
4. Add HTTP referrer: `https://your-app.vercel.app/*`

#### 3. Update Google OAuth (if using custom domain)
1. **APIs & Services** > **Credentials**
2. Edit OAuth 2.0 client
3. Add JavaScript origins: `https://your-app.vercel.app`

## 🧪 Testing Production

### After Deployment, Test:
- [ ] Application loads
- [ ] Google authentication works
- [ ] Map displays correctly
- [ ] Search functionality works
- [ ] Can save/edit prospects
- [ ] Navigation works
- [ ] No console errors

## 🔄 Future Updates

For future updates:
```bash
# Make your changes
git add .
git commit -m "Feature: your update description"
git push origin main
```

Vercel will automatically redeploy! 🎉

## 🚨 Emergency Rollback

If something goes wrong:
1. Go to Vercel Dashboard
2. Find your project
3. Click on a previous successful deployment
4. Click "Promote to Production"

---

**Ready to deploy?** Just run the Firebase security rules deployment first, then push to GitHub!
