# 🚀 Production Setup Guide

This guide will walk you through deploying **Opto Prospect** to production step by step.

## ✅ Prerequisites Checklist

Before starting, ensure you have:
- [ ] Firebase project created and configured
- [ ] Google Cloud Platform project with Maps API enabled
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Environment variables configured in `.env.local`
- [ ] Successful local build (`npm run build`)

## 🔐 Step 1: Deploy Firebase Security Rules

### Option A: Automatic Deployment (Recommended)
```bash
# Run the automated script
./deploy-firebase.sh
```

### Option B: Manual Deployment
```bash
# Login to Firebase (if not already)
firebase login

# Initialize Firebase in your project (if not already)
firebase init

# Deploy security rules
firebase deploy --only firestore:rules

# Deploy database indexes
firebase deploy --only firestore:indexes
```

### Verify Security Rules
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Firestore Database** > **Rules**
4. Verify the rules match the content in `firestore.rules`

## 🗺️ Step 2: Configure Google Maps API

### Set API Restrictions
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** > **Credentials**
3. Find your Maps API key
4. Click **Edit** (pencil icon)
5. Under **Website restrictions**:
   - Select **HTTP referrers (web sites)**
   - Add your production domain(s):
     ```
     https://yourdomain.com/*
     https://www.yourdomain.com/*
     ```

### Verify API Access
- Ensure these APIs are enabled:
  - Maps JavaScript API
  - Places API

## 🌐 Step 3: Choose Deployment Platform

### Option A: Vercel (Recommended for Next.js)

1. **Connect Repository**
   ```bash
   # Push your code to GitHub
   git add .
   git commit -m "Production ready"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Configure environment variables in Vercel dashboard

3. **Environment Variables for Vercel**
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

### Option B: Firebase Hosting

1. **Build for Static Export**
   ```bash
   cd web
   npm run build
   ```

2. **Deploy to Firebase Hosting**
   ```bash
   firebase deploy --only hosting
   ```

### Option C: Netlify

1. **Connect Repository** in Netlify dashboard
2. **Build Settings**:
   - Build command: `cd web && npm run build`
   - Publish directory: `web/.next`
3. **Environment Variables**: Add all `NEXT_PUBLIC_*` variables

## 🔧 Step 4: Configure Production Environment

### Firebase Authentication Setup
1. Go to Firebase Console > **Authentication** > **Settings**
2. Under **Authorized domains**, add:
   - Your production domain (e.g., `yourdomain.com`)
   - Your www subdomain (e.g., `www.yourdomain.com`)

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** > **Credentials**
3. Edit your OAuth 2.0 client
4. Add your production domains to **Authorized JavaScript origins**:
   ```
   https://yourdomain.com
   https://www.yourdomain.com
   ```

## 🧪 Step 5: Testing Production Deployment

### Functionality Tests
- [ ] Application loads correctly
- [ ] Google authentication works
- [ ] Map loads and displays markers
- [ ] Search functionality works
- [ ] Save/unsave prospects works
- [ ] Notes and events can be added
- [ ] Navigation between pages works

### Security Tests
- [ ] Environment variables are not exposed in browser
- [ ] Firebase security rules prevent unauthorized access
- [ ] Console logs are removed in production
- [ ] Security headers are present

### Performance Tests
- [ ] Page load speed is acceptable
- [ ] Maps load quickly
- [ ] Images are optimized
- [ ] No console errors

## 🔒 Step 6: Security Hardening

### SSL Certificate
- Ensure your hosting platform provides SSL (most do automatically)
- Verify HTTPS redirects are working

### Monitor Security Headers
Use tools like:
- [Security Headers](https://securityheaders.com)
- [SSL Labs](https://www.ssllabs.com/ssltest/)

### Firebase Security Rules Testing
```bash
# Test security rules locally
firebase emulators:start --only firestore
```

## 📊 Step 7: Monitoring & Analytics

### Set Up Monitoring
1. **Vercel Analytics** (if using Vercel)
2. **Google Analytics** (via Firebase)
3. **Error tracking** (consider Sentry)

### Firebase Performance Monitoring
1. Go to Firebase Console > **Performance**
2. Enable performance monitoring
3. Monitor Core Web Vitals

## 🚨 Step 8: Backup & Recovery

### Data Backup
- Firebase automatically backs up Firestore data
- Consider exporting critical data regularly

### Environment Variables Backup
- Store environment variables securely
- Document all API keys and their restrictions

## ✅ Production Checklist

Before going live:
- [ ] All environment variables configured
- [ ] Firebase security rules deployed
- [ ] Google Maps API restrictions set
- [ ] Domain added to Firebase authorized domains
- [ ] OAuth domains configured
- [ ] SSL certificate active
- [ ] Performance tested
- [ ] Security headers verified
- [ ] Error monitoring set up
- [ ] Analytics configured

## 🆘 Troubleshooting

### Common Issues

**Build Failures**
- Check all environment variables are set
- Verify API keys are valid
- Ensure dependencies are installed

**Authentication Issues**
- Verify authorized domains in Firebase
- Check OAuth consent screen configuration
- Confirm API keys have correct permissions

**Map Not Loading**
- Verify Google Maps API key
- Check API restrictions match your domain
- Confirm billing is enabled for Maps API

**Database Access Denied**
- Check Firestore security rules
- Verify user authentication
- Confirm Firebase project configuration

### Getting Help
- Check [Firebase Documentation](https://firebase.google.com/docs)
- Review [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- See `web/DEPLOYMENT.md` for detailed deployment guides

---

🎉 **Congratulations!** Your Opto Prospect application is now ready for production use!
