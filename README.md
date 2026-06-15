# Cloudflare Worker Weather Dashboard Demo

A high-performance serverless Cloudflare Workers application served directly from the edge. It features a beautiful, dynamic V8 Isolate dashboard, geo-location diagnostics, and a dynamic weather querying widget powered by Open-Meteo.

## ✨ Features

- **Edge HTML Dashboard**: Serves a premium dark-themed web interface with glassmorphic cards and dynamic styling.
- **Auto Geolocation Weather**: Detects the user's location via incoming Cloudflare coordinates (`request.cf`) and retrieves real-time weather information from Open-Meteo.
- **Global Weather Search**: Search for any city in the world; utilizes Open-Meteo Geocoding to resolve coordinates.
- **Developer Joke API**: `/api/joke` returns serverless random developer jokes.
- **High-Precision Time API**: `/api/time` returns edge server time and timestamp.
- **Request Details API**: `/api/info` returns client IP, region, and HTTP headers.
- **Payload Echo Service**: `POST /api/echo` accepts and echoes back POST requests.

---

## 🛠️ Local Development

To run the project locally using Cloudflare's Wrangler CLI:

```bash
# 1. Install dependencies (if you add any npm modules in the future)
# npm install

# 2. Run the Wrangler dev server
npx wrangler dev --port 8787
```

Open [http://localhost:8787](http://localhost:8787) in your browser to view the interactive dashboard.

---

## 🚀 GitHub Actions Deployment

This project includes a GitHub Actions workflow that automatically deploys your Worker to Cloudflare on push to `main` or `master` branches.

### Setup Instructions:

1. **Initialize Git & Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-new-github-repo-url>
   git branch -M main
   git push -u origin main
   ```

2. **Add Secrets**:
   Go to your new GitHub Repository Settings ➡️ **Secrets and variables** ➡️ **Actions** ➡️ **New repository secret**:
   - **Name**: `CLOUDFLARE_API_TOKEN`
   - **Value**: Your Cloudflare API Token (created with the Edit Cloudflare Workers template).
