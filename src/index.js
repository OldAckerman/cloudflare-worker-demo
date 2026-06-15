const JOKES = [
  "Why do programmers wear glasses? Because they can't C#.",
  "There are 10 types of people in the world: those who understand binary, and those who don't.",
  "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
  "A SQL query goes into a bar, walks up to two tables and asks, 'Can I join you?'",
  "['hip', 'hip'] (hip hip array!)",
  "Why did the programmer quit their job? Because they didn't get arrays.",
  "An optimist says the glass is half full. A pessimist says the glass is half empty. A programmer says the glass is twice as large as it needs to be."
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Dynamic routing
    switch (url.pathname) {
      case '/api/time':
        return handleTime(request);
      case '/api/info':
        return handleInfo(request);
      case '/api/joke':
        return handleJoke(request);
      case '/api/weather':
        return handleWeather(request);
      case '/api/echo':
        if (request.method === 'POST') {
          return handleEcho(request);
        }
        return new Response(JSON.stringify({ error: "Only POST method is allowed for /api/echo" }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
      case '/':
        return new Response(getHTML(request), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      default:
        return new Response(JSON.stringify({ error: "Not Found", code: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  }
};

function handleTime(request) {
  return new Response(JSON.stringify({
    utcTime: new Date().toISOString(),
    localTimeString: new Date().toLocaleString(),
    timestamp: Date.now(),
    timezone: "UTC (Edge Server Default)"
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function handleInfo(request) {
  const cf = request.cf || {
    city: "Localhost",
    country: "XX",
    continent: "Unknown",
    latitude: "39.9042",
    longitude: "116.4074",
    timezone: "Local",
    colo: "LOC"
  };

  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }

  const clientIP = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";

  return new Response(JSON.stringify({
    message: "Hello from the Edge!",
    clientIpAddress: clientIP,
    geolocation: {
      city: cf.city,
      country: cf.country,
      continent: cf.continent,
      latitude: cf.latitude,
      longitude: cf.longitude,
      timezone: cf.timezone,
      datacenter: cf.colo
    },
    requestHeaders: headers,
    httpMethod: request.method,
    httpVersion: request.httpVersion || "HTTP/1.1"
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function handleJoke(request) {
  const randomIndex = Math.floor(Math.random() * JOKES.length);
  return new Response(JSON.stringify({
    joke: JOKES[randomIndex],
    id: randomIndex,
    servedBy: "Cloudflare Worker Edge Memory"
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handleWeather(request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  
  let lat, lon, resolvedCityName;
  
  if (city) {
    // 1. Try Nominatim (OSM Geocoding) first to support Chinese city names
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
      const osmResponse = await fetch(osmUrl, {
        headers: {
          'User-Agent': 'Cloudflare-Worker-Weather-Demo/1.0 (contact: admin@example.com)'
        }
      });
      const osmData = await osmResponse.json();
      
      if (osmData && osmData.length > 0) {
        const result = osmData[0];
        lat = result.lat;
        lon = result.lon;
        resolvedCityName = result.display_name;
      }
    } catch (err) {
      console.error("Nominatim geocoding failed, falling back to Open-Meteo...", err);
    }
    
    // 2. Fallback to Open-Meteo Geocoding (supports English/Pinyin)
    if (!lat || !lon) {
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);
        const geoData = await geoResponse.json();
        
        if (geoData.results && geoData.results.length > 0) {
          const result = geoData.results[0];
          lat = result.latitude;
          lon = result.longitude;
          resolvedCityName = result.name + (result.admin1 ? `, ${result.admin1}` : "") + `, ${result.country}`;
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to resolve city geocode", details: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: `City '${city}' not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  } else {
    // Auto detect location from Cloudflare cf header
    const cf = request.cf || {};
    lat = cf.latitude || "39.9042"; // Beijing default
    lon = cf.longitude || "116.4074";
    resolvedCityName = cf.city ? `${cf.city}, ${cf.country || 'CN'}` : "Beijing, CN (Default)";
  }
  
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    if (!weatherData.current_weather) {
      return new Response(JSON.stringify({ error: "No weather data returned from weather service" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    return new Response(JSON.stringify({
      city: resolvedCityName,
      latitude: lat,
      longitude: lon,
      current: {
        temperature: weatherData.current_weather.temperature,
        windspeed: weatherData.current_weather.windspeed,
        winddirection: weatherData.current_weather.winddirection,
        weathercode: weatherData.current_weather.weathercode,
        time: weatherData.current_weather.time
      },
      attribution: "Weather data by Open-Meteo.com"
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch weather data", details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}


async function handleEcho(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      body = await request.text();
    }

    return new Response(JSON.stringify({
      message: "Data echoed successfully!",
      echoedData: body,
      receivedAt: new Date().toISOString()
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to parse body", details: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function getHTML(request) {
  const cf = request.cf || {};
  const country = cf.country || "Edge Network";
  const city = cf.city || "Closest Datacenter";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Workers Interactive Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% 50%, #171426 0%, #0a0810 100%);
      --accent-primary: #f6821f; /* Cloudflare Orange */
      --accent-secondary: #ffad66;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-hover-border: rgba(246, 130, 31, 0.4);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --shadow-color: rgba(246, 130, 31, 0.15);
      --glow-blue: rgba(59, 130, 246, 0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-gradient);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
      overflow-x: hidden;
    }

    .container {
      max-width: 1100px;
      width: 100%;
      z-index: 10;
    }

    header {
      text-align: center;
      margin-bottom: 2.5rem;
      position: relative;
    }

    header::after {
      content: '';
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      width: 120px;
      height: 120px;
      background: var(--accent-primary);
      filter: blur(80px);
      opacity: 0.4;
      z-index: -1;
    }

    .logo-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin-bottom: 0.8rem;
    }

    .logo-icon {
      width: 44px;
      height: 44px;
      fill: var(--accent-primary);
      filter: drop-shadow(0 0 8px var(--shadow-color));
      animation: spin 30s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    h1 {
      font-size: 3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, #fff 30%, var(--accent-secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .tagline {
      font-size: 1.15rem;
      color: var(--text-muted);
      font-weight: 300;
      margin-top: 0.5rem;
    }

    /* Edge regions info */
    .location-banner {
      background: linear-gradient(90deg, rgba(246, 130, 31, 0.08), rgba(99, 102, 241, 0.08));
      border: 1px solid rgba(246, 130, 31, 0.15);
      border-radius: 16px;
      padding: 1.2rem;
      display: flex;
      justify-content: space-around;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 2.5rem;
      font-size: 0.95rem;
      backdrop-filter: blur(8px);
    }

    .location-banner span strong {
      color: var(--accent-secondary);
    }

    /* Main layouts: Three primary cards */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1.1fr 1.3fr;
      gap: 2rem;
      margin-bottom: 2.5rem;
    }

    @media (max-width: 900px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Cards styling */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 2rem;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .card:hover {
      border-color: rgba(255, 255, 255, 0.12);
    }

    .card h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.75rem;
    }

    /* WEATHER SECTION */
    .weather-card {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 2rem;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.02) 100%);
      position: relative;
      overflow: hidden;
    }

    .weather-card::after {
      content: '';
      position: absolute;
      bottom: -50px;
      right: -50px;
      width: 200px;
      height: 200px;
      background: rgba(59, 130, 246, 0.08);
      filter: blur(60px);
      border-radius: 50%;
      z-index: -1;
    }

    @media (max-width: 768px) {
      .weather-card {
        grid-template-columns: 1fr;
      }
    }

    .weather-widget {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 1.5rem;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      text-align: center;
      transition: all 0.5s ease;
    }

    .weather-temp {
      font-size: 3.5rem;
      font-weight: 800;
      line-height: 1;
      margin: 0.5rem 0;
      background: linear-gradient(135deg, #ffffff 40%, #93c5fd 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .weather-city {
      font-size: 1.2rem;
      font-weight: 600;
      color: #fff;
      margin-bottom: 0.25rem;
    }

    .weather-desc {
      font-size: 1rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 1rem;
    }

    .weather-icon-lg {
      font-size: 4rem;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.2));
      animation: float 4s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }

    .weather-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      width: 100%;
      margin-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 1rem;
    }

    .weather-detail-item {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .weather-detail-item strong {
      display: block;
      font-size: 1rem;
      color: #fff;
      margin-top: 2px;
    }

    .weather-search-box {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .weather-search-box p {
      font-size: 0.95rem;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }

    /* Form Inputs & Buttons */
    .input-group {
      display: flex;
      gap: 0.5rem;
    }

    .text-input {
      flex-grow: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      color: #fff;
      padding: 0.8rem 1rem;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .text-input:focus {
      border-color: var(--accent-primary);
      box-shadow: 0 0 10px rgba(246, 130, 31, 0.15);
    }

    .btn {
      background: var(--accent-primary);
      border: none;
      color: #fff;
      padding: 0.8rem 1.5rem;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn:hover {
      background: #e07216;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(246, 130, 31, 0.3);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn-secondary {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text-main);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: none;
    }

    /* API CONTROLS */
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .api-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 0.9rem 1.2rem;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      text-align: left;
    }

    .api-btn:hover {
      background: linear-gradient(90deg, rgba(246, 130, 31, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%);
      border-color: var(--card-hover-border);
      transform: scale(1.01) translateX(3px);
    }

    .api-btn span.method {
      font-family: 'Fira Code', monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 6px;
      border-radius: 6px;
      font-weight: 600;
    }

    .echo-section {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px dashed var(--card-border);
    }

    .echo-section label {
      font-size: 0.85rem;
      color: var(--text-muted);
      display: block;
      margin-bottom: 0.6rem;
    }

    /* TERMINAL */
    .terminal-card {
      background: #08060c;
      border: 1px solid var(--card-border);
      border-radius: 24px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    }

    .terminal-header {
      background: rgba(255, 255, 255, 0.015);
      border-bottom: 1px solid var(--card-border);
      padding: 0.9rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .terminal-dots {
      display: flex;
      gap: 6px;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot.red { background: #ff5f56; }
    .dot.yellow { background: #ffbd2e; }
    .dot.green { background: #27c93f; }

    .terminal-title {
      font-family: 'Fira Code', monospace;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .terminal-body {
      padding: 1.5rem;
      flex-grow: 1;
      overflow-y: auto;
      max-height: 480px;
      font-family: 'Fira Code', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      color: #34d399; /* emerald-400 */
    }

    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .status-badge {
      display: inline-block;
      font-family: 'Fira Code', monospace;
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 6px;
      margin-bottom: 1.2rem;
      font-weight: 500;
    }

    .status-ok {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .status-idle {
      background: rgba(156, 163, 175, 0.1);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.2);
    }

    /* JSON HIGHLIGHT */
    .json-key { color: #f472b6; }
    .json-value-str { color: #34d399; }
    .json-value-num { color: #fbbf24; }
    .json-value-bool { color: #60a5fa; }
    .json-value-null { color: #f87171; }

    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--card-border);
      padding: 2rem 0;
      margin-top: 4rem;
      width: 100%;
    }

    footer a {
      color: var(--accent-secondary);
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>

  <div class="container">
    <header>
      <div class="logo-container">
        <svg class="logo-icon" viewBox="0 0 114 114">
          <path d="M11.5,63.8 C9,64 6.7,65.6 5.8,68 C4.8,70.5 5.5,73.3 7.5,75 L28,91.3 C28,91.3 35.8,82.8 45.4,72.4 L24.3,64.2 C20.3,62.6 15.8,62.5 11.5,63.8 Z" fill="#F38020"/>
          <path d="M96.7,35 C90.5,23.3 78,16 64.5,16 C50,16 36.8,24.3 31.2,37.3 C21,38.8 13.2,47.2 12.3,57.5 C17.3,55.9 22.6,55.8 27.7,57.1 L60.7,65.8 C64.6,66.8 67.5,70 68,74 L72.2,108 C80.3,105 87.2,99.2 91.5,91.7 C100.8,91.7 109,85.6 111.4,76.5 C113.8,67.4 109.8,57.8 101.6,53.2 C101.9,50 101.7,46.7 100.9,43.6 C99.8,40.4 98.4,37.6 96.7,35 Z" fill="#FAAD3F"/>
          <path d="M64.4,79 L57.8,24 C57.8,24 49.3,31 38,39.8 L48.8,74.9 C52.9,78.2 58.7,80 64.4,79 Z" fill="#F38020"/>
        </svg>
        <h1>Edge Engine Dashboard</h1>
      </div>
      <p class="tagline">An interactive, feature-rich sandbox served directly from Cloudflare Edge</p>
    </header>

    <div class="location-banner">
      <span>🌐 Edge Region: <strong>${country}</strong></span>
      <span>🏢 POP Datacenter: <strong>${city}</strong></span>
      <span>⚡ Core Framework: <strong>V8 Isolate</strong></span>
    </div>

    <div class="dashboard-grid">
      
      <!-- WEATHER CARD (Row spanning, occupies full width) -->
      <div class="card weather-card">
        <div class="weather-widget" id="weatherWidget">
          <div class="weather-icon-lg" id="weatherIcon">☀️</div>
          <div class="weather-temp" id="weatherTemp">--°C</div>
          <div class="weather-city" id="weatherCity">Detecting Location...</div>
          <div class="weather-desc" id="weatherCondition">Retrieving current conditions</div>
          
          <div class="weather-details">
            <div class="weather-detail-item">
              Wind Speed
              <strong id="weatherWind">-- km/h</strong>
            </div>
            <div class="weather-detail-item">
              Latitude/Longitude
              <strong id="weatherCoords">--, --</strong>
            </div>
          </div>
        </div>
        
        <div class="weather-search-box">
          <h2>Edge Aggregated Weather</h2>
          <p>
            This feature demonstrates **Edge API Aggregation**. When requested, the Cloudflare Worker intercepts the request, maps your incoming IP coordinates or queries the Open-Meteo Geocoding database, triggers a background fetch to retrieve weather forecasts, and synthesizes a structured API response in milliseconds.
          </p>
          <div class="input-group">
            <input type="text" id="weatherCityInput" class="text-input" placeholder="Enter city name (e.g. Tokyo, London)..." onkeydown="if(event.key==='Enter') searchWeather()">
            <button class="btn" onclick="searchWeather()">Search Weather</button>
          </div>
        </div>
      </div>

      <!-- API CONTROLLER PANEL -->
      <div class="card">
        <h2>Service Controller</h2>
        <div class="btn-group">
          <button class="api-btn" onclick="triggerAPI('/api/info')">
            <span>Query Geolocation & Request Details</span>
            <span class="method">GET</span>
          </button>
          
          <button class="api-btn" onclick="triggerAPI('/api/time')">
            <span>Query High-Precision Server Time</span>
            <span class="method">GET</span>
          </button>
          
          <button class="api-btn" onclick="triggerAPI('/api/joke')">
            <span>Retrieve Random Developer Joke</span>
            <span class="method">GET</span>
          </button>
          
          <button class="api-btn" onclick="triggerAPI('/api/weather')">
            <span>View Raw Weather JSON (Local Node)</span>
            <span class="method">GET</span>
          </button>
        </div>

        <div class="echo-section">
          <label for="echoInput">Perform POST request to /api/echo</label>
          <div class="input-group">
            <input type="text" id="echoInput" class="text-input" placeholder="Type text payload..." value="Ping! Hello Cloudflare Worker Edge!">
            <button class="btn btn-secondary" onclick="postPayload()">POST Data</button>
          </div>
        </div>
      </div>

      <!-- OUTPUT LOG TERMINAL -->
      <div class="terminal-card">
        <div class="terminal-header">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <div class="terminal-title" id="terminalEndpoint">system_ready.sh</div>
        </div>
        <div class="terminal-body">
          <div id="terminalStatus" class="status-badge status-idle">IDLE</div>
          <pre id="terminalOutput">// Ready for API triggers.
// Trigger any operation to print incoming JSON payloads dynamically.</pre>
        </div>
      </div>

    </div>

    <footer>
      <p>Served with 🧡 by <a href="https://workers.cloudflare.com/" target="_blank">Cloudflare Workers</a> | Built dynamically at the edge.</p>
    </footer>
  </div>

  <script>
    // WMO Weather interpretation codes
    const weatherCodes = {
      0: { desc: 'Clear sky', icon: '☀️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(251, 191, 36, 0.06) 100%)' },
      1: { desc: 'Mainly clear', icon: '🌤️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(251, 191, 36, 0.04) 100%)' },
      2: { desc: 'Partly cloudy', icon: '⛅', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(147, 197, 253, 0.03) 100%)' },
      3: { desc: 'Overcast', icon: '☁️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(107, 114, 128, 0.05) 100%)' },
      45: { desc: 'Foggy', icon: '🌫️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(156, 163, 175, 0.05) 100%)' },
      48: { desc: 'Depositing rime fog', icon: '🌫️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(156, 163, 175, 0.05) 100%)' },
      51: { desc: 'Light drizzle', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.06) 100%)' },
      53: { desc: 'Moderate drizzle', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.08) 100%)' },
      55: { desc: 'Dense drizzle', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.1) 100%)' },
      61: { desc: 'Slight rain', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.08) 100%)' },
      63: { desc: 'Moderate rain', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.12) 100%)' },
      65: { desc: 'Heavy rain', icon: '🌧️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(29, 78, 216, 0.15) 100%)' },
      71: { desc: 'Slight snow fall', icon: '❄️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(147, 197, 253, 0.08) 100%)' },
      73: { desc: 'Moderate snow fall', icon: '❄️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(147, 197, 253, 0.12) 100%)' },
      75: { desc: 'Heavy snow fall', icon: '❄️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(147, 197, 253, 0.18) 100%)' },
      80: { desc: 'Slight rain showers', icon: '🌦️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.08) 100%)' },
      81: { desc: 'Moderate rain showers', icon: '🌦️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(59, 130, 246, 0.12) 100%)' },
      82: { desc: 'Violent rain showers', icon: '⛈️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(29, 78, 216, 0.18) 100%)' },
      95: { desc: 'Thunderstorm', icon: '⛈️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(124, 58, 237, 0.15) 100%)' },
      96: { desc: 'Thunderstorm with hail', icon: '⛈️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(124, 58, 237, 0.18) 100%)' },
      99: { desc: 'Thunderstorm with heavy hail', icon: '⛈️', bg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(124, 58, 237, 0.22) 100%)' }
    };

    function syntaxHighlight(json) {
      if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
      }
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
        var cls = 'json-value-num';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-value-str';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-value-bool';
        } else if (/null/.test(match)) {
          cls = 'json-value-null';
        }
        if (cls === 'json-key') {
          return '<span class="' + cls + '">' + match.replace(/:$/, '') + '</span>:';
        } else {
          return '<span class="' + cls + '">' + match + '</span>';
        }
      });
    }

    async function triggerAPI(endpoint, isSilent = false) {
      const viewer = document.getElementById('terminalOutput');
      const termTitle = document.getElementById('terminalEndpoint');
      const badge = document.getElementById('terminalStatus');
      
      if (!isSilent) {
        termTitle.textContent = "fetch('" + endpoint + "')";
        badge.className = "status-badge status-idle";
        badge.textContent = "FETCHING...";
        viewer.innerHTML = "// Requesting edge worker...";
      }

      try {
        const start = performance.now();
        const response = await fetch(endpoint);
        const elapsed = (performance.now() - start).toFixed(1);
        const data = await response.json();
        
        if (!isSilent) {
          badge.className = "status-badge status-ok";
          badge.innerHTML = "HTTP " + response.status + " | " + elapsed + "ms";
          viewer.innerHTML = syntaxHighlight(data);
        }
        return data;
      } catch (err) {
        if (!isSilent) {
          badge.className = "status-badge";
          badge.style.background = "rgba(239, 68, 68, 0.15)";
          badge.style.color = "#ef4444";
          badge.style.border = "1px solid rgba(239, 68, 68, 0.25)";
          badge.textContent = "ERROR";
          viewer.innerHTML = "// Operation failed:\\n" + err.message;
        }
        throw err;
      }
    }

    async function postPayload() {
      const val = document.getElementById('echoInput').value;
      const viewer = document.getElementById('terminalOutput');
      const termTitle = document.getElementById('terminalEndpoint');
      const badge = document.getElementById('terminalStatus');
      
      termTitle.textContent = "fetch('/api/echo', { method: 'POST' })";
      badge.className = "status-badge status-idle";
      badge.textContent = "POSTING...";
      viewer.innerHTML = "// Shipping POST payload to edge...";

      try {
        const start = performance.now();
        const response = await fetch('/api/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: val })
        });
        const elapsed = (performance.now() - start).toFixed(1);
        const data = await response.json();
        
        badge.className = "status-badge status-ok";
        badge.innerHTML = "HTTP " + response.status + " | " + elapsed + "ms";
        viewer.innerHTML = syntaxHighlight(data);
      } catch (err) {
        badge.className = "status-badge";
        badge.style.background = "rgba(239, 68, 68, 0.15)";
        badge.style.color = "#ef4444";
        badge.style.border = "1px solid rgba(239, 68, 68, 0.25)";
        badge.textContent = "ERROR";
        viewer.innerHTML = "// POST failed:\\n" + err.message;
      }
    }

    // Weather handler
    async function loadLocalWeather() {
      try {
        const data = await triggerAPI('/api/weather', true);
        displayWeather(data);
      } catch (err) {
        document.getElementById('weatherCity').textContent = "Auto-detection failed";
        document.getElementById('weatherCondition').textContent = "Use city search instead";
      }
    }

    async function searchWeather() {
      const city = document.getElementById('weatherCityInput').value.trim();
      if (!city) return;
      
      const widget = document.getElementById('weatherWidget');
      const cityText = document.getElementById('weatherCity');
      const condText = document.getElementById('weatherCondition');
      
      cityText.textContent = "Searching...";
      condText.textContent = "Querying databases...";
      
      try {
        const data = await triggerAPI('/api/weather?city=' + encodeURIComponent(city));
        displayWeather(data);
      } catch (err) {
        cityText.textContent = "Error";
        condText.textContent = "City not found or request failed.";
      }
    }

    function displayWeather(data) {
      const tempText = document.getElementById('weatherTemp');
      const cityText = document.getElementById('weatherCity');
      const condText = document.getElementById('weatherCondition');
      const windText = document.getElementById('weatherWind');
      const coordsText = document.getElementById('weatherCoords');
      const iconText = document.getElementById('weatherIcon');
      const card = document.getElementById('weatherWidget').closest('.weather-card');
      
      const code = data.current.weathercode;
      const mapping = weatherCodes[code] || { desc: 'Unknown', icon: '❓', bg: 'var(--card-bg)' };
      
      tempText.textContent = Math.round(data.current.temperature) + '°C';
      cityText.textContent = data.city;
      condText.textContent = mapping.desc;
      windText.textContent = data.current.windspeed + ' km/h';
      coordsText.textContent = Number(data.latitude).toFixed(3) + ', ' + Number(data.longitude).toFixed(3);
      iconText.textContent = mapping.icon;
      
      // Update background dynamically for dynamic visual feedback
      card.style.background = mapping.bg;
      card.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    }

    // Initial load
    window.addEventListener('DOMContentLoaded', () => {
      loadLocalWeather();
    });
  </script>
</body>
</html>
  `;
}
