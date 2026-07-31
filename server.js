// ============================================================================
// LeadForge — Express proxy server (Railway deployment)
// ----------------------------------------------------------------------------
// Pattern: identical to ProductForge / ChannelForge / ContentForge / DropForge.
//   - Serves the single-file frontend from /public
//   - Proxies Anthropic API calls so the API key NEVER touches the browser
//   - Stubs real-lead data sources (Google Places) as clearly-commented 501s
//
// Railway env vars required:
//   ANTHROPIC_API_KEY   -> your Anthropic key (Settings > Variables)
//   GOOGLE_PLACES_KEY   -> (later) Google Places API key, activates real leads
// ============================================================================

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY; // not set yet -> stub mode

// ---------------------------------------------------------------------------
// Health check — frontend calls this on load to detect proxy vs direct mode.
// Also reports whether real lead search is live (Places key present).
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'leadforge',
    anthropic: Boolean(ANTHROPIC_API_KEY),
    leadsSearch: Boolean(GOOGLE_PLACES_KEY) ? 'live' : 'stub',
  });
});

// ---------------------------------------------------------------------------
// Anthropic proxy — the frontend posts a standard /v1/messages body here.
// ---------------------------------------------------------------------------
app.post('/api/generate', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
  }
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream Anthropic request failed', detail: String(err) });
  }
});

// ===========================================================================
// STUB: /api/leads-search  — REAL lead discovery via Google Places API
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//   An LLM cannot know which real businesses currently lack a website.
//   That requires a live data source. Google Places "Text Search" returns
//   businesses for "<industry> in <location>" and each result includes a
//   `websiteUri` field — results with NO websiteUri are your hottest leads.
//
// HOW TO ACTIVATE (no frontend changes needed — it already calls this
// endpoint first and falls back to practice mode on 501):
//
//   1. Google Cloud Console -> enable "Places API (New)" -> create API key
//   2. Railway -> Variables -> add GOOGLE_PLACES_KEY
//   3. Replace the 501 below with the implementation sketched here:
//
//   app.post('/api/leads-search', async (req, res) => {
//     const { industry, location, maxResults = 20 } = req.body;
//     const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
//         // FieldMask controls billing — request only what you need:
//         'X-Goog-FieldMask': [
//           'places.displayName', 'places.formattedAddress',
//           'places.websiteUri', 'places.nationalPhoneNumber',
//           'places.rating', 'places.userRatingCount', 'places.googleMapsUri',
//         ].join(','),
//       },
//       body: JSON.stringify({ textQuery: `${industry} in ${location}`, maxResultCount: maxResults }),
//     });
//     const data = await r.json();
//     const leads = (data.places || []).map(p => ({
//       businessName: p.displayName?.text,
//       address: p.formattedAddress,
//       phone: p.nationalPhoneNumber || null,
//       website: p.websiteUri || null,          // null  ==> NO WEBSITE lead
//       rating: p.rating || null,
//       reviews: p.userRatingCount || 0,
//       mapsUrl: p.googleMapsUri,
//       painPoint: p.websiteUri ? 'outdated-site' : 'no-site',
//       source: 'google-places',
//     }))
//     // no-website leads first, then well-reviewed businesses (proven demand)
//     .sort((a, b) => (a.website ? 1 : 0) - (b.website ? 1 : 0) || b.reviews - a.reviews);
//     res.json({ mode: 'live', leads });
//   });
//
//   COST NOTE: Text Search (Basic fields) ≈ $32 / 1000 requests, with a
//   recurring monthly free credit — one search per niche+suburb is cheap.
// ===========================================================================
app.post('/api/leads-search', (req, res) => {
  res.status(501).json({
    error: 'not_implemented',
    message: 'Real lead search is not wired yet. Set GOOGLE_PLACES_KEY and implement per the comments in server.js. The app will run in practice/template mode.',
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`LeadForge running on :${PORT}`));
