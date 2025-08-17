# Opto Prospect

**A comprehensive optometrist and eye care center discovery platform for sales professionals and consultants.**

![Next.js](https://img.shields.io/badge/Next.js-15.4.6-black)
![React](https://img.shields.io/badge/React-19.1.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Firebase](https://img.shields.io/badge/Firebase-12.1.0-orange)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1.12-38B2AC)

## 🎯 Purpose

Opto Prospect is designed for ophthalmologists, sales professionals, medical equipment vendors, and consultants who need to efficiently discover, track, and manage relationships with optometrists and eye care centers in specific geographic areas.

## ✨ Key Features

### 🗺️ Interactive Map Search
- **Location-based discovery**: Search for optometrists and eye care centers by ZIP code
- **Customizable radius**: Adjust search radius from 1-10 miles
- **Real-time filtering**: Toggle between optometrists and eye care centers
- **Google Maps integration**: Full-featured map with markers and info windows

### 👥 Prospect Management
- **Save prospects**: One-click saving of interesting prospects
- **Meeting tracking**: Mark prospects as "met" or "lost cause"
- **Detailed notes**: Add and manage notes for each prospect
- **Event logging**: Track meetings, calls, and interactions with timestamps

### 🔐 Secure Authentication
- **Google OAuth**: Secure sign-in with Google accounts
- **User data isolation**: Each user's data is completely private
- **Persistent sessions**: Automatic session management

### 📱 Modern UX
- **Responsive design**: Works perfectly on desktop, tablet, and mobile
- **Real-time updates**: Instant sync across devices
- **Intuitive interface**: Clean, professional design built with Tailwind CSS
- **Fast navigation**: Seamless transitions between map and saved prospects

## 🏗️ Technical Architecture

### Frontend
- **Next.js 15.4.6** with App Router
- **React 19.1.0** with TypeScript
- **Tailwind CSS 4.1.12** for styling
- **Google Maps JavaScript API** for mapping
- **Firebase SDK** for authentication and data

### Backend & Data
- **Firebase Authentication** for user management
- **Cloud Firestore** for data storage
- **Firebase Security Rules** for data protection
- **Google Places API** for business data

### Security Features
- **Security headers** (XSS protection, frame options, etc.)
- **Environment variable validation**
- **Console log removal** in production
- **Input sanitization**
- **Authenticated API access only**

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Firebase project
- Google Cloud Platform project with Maps API enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/opto-prospect.git
   cd opto-prospect/web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` with your actual API keys and configuration values.

4. **Configure Firebase**
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Authentication with Google provider
   - Create a Firestore database
   - Add your domain to authorized domains in Authentication settings

5. **Set up Google Maps API**
   - Enable Maps JavaScript API and Places API
   - Create credentials and add your domain

6. **Run development server**
   ```bash
   npm run dev
   ```

7. **Open in browser**
   Visit http://localhost:3000

## 📋 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key | ✅ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | ✅ |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | ✅ |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | ✅ |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | ✅ |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase measurement ID | ❌ |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key | ✅ |

## 🏭 Production Deployment

### Pre-deployment Checklist
- [ ] All environment variables configured
- [ ] Firebase security rules deployed
- [ ] Google Maps API keys restricted to production domains
- [ ] Domain added to Firebase authorized domains
- [ ] SSL certificate configured

### Build Commands
```bash
# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

### Deployment Platforms
The application is optimized for deployment on:
- **Vercel** (recommended)
- **Netlify**
- **Firebase Hosting**
- **Any Node.js hosting provider**

## 🔒 Security Considerations

### Production Security Features
- **Console log removal**: All debug logs removed in production builds
- **Security headers**: XSS protection, frame options, content type options
- **Environment validation**: Required environment variables validated at startup
- **Firebase security rules**: Database access restricted to authenticated users
- **API key restrictions**: Geographic and domain restrictions on API keys

### Data Privacy
- User data is isolated per Firebase UID
- No cross-user data access possible
- All database operations require authentication
- Personal data encrypted in transit and at rest

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💼 Contact

**Joaquin De Rojas Consulting LLC**

For questions, support, or consulting services, please reach out through GitHub issues or contact information in the application footer.

---

*Built with ❤️ for sales professionals who need better tools to manage their prospect relationships.*
