# Grapewine

A B2B sales outreach tool that automates lead generation for recruiting products. It scrapes hiring signals from job boards, finds the right LinkedIn hiring managers, scores leads by urgency, and sends personalized outreach emails — all from a single dashboard.

## How It Works

1. **Search** — Enter a job function (e.g. "Software Engineer") and city. Grapewine scrapes 6 job platforms in parallel: Naukri, Wellfound, Cutshort, Instahyre, IIM Jobs, and Times Jobs.
2. **Deduplicate** — Jobs posted by the same company for the same role across multiple platforms are merged into one lead. Cross-platform presence boosts the activity score.
3. **Find Hiring Managers** — Uses Apify to find the relevant LinkedIn hiring manager at each company.
4. **Score** — Each lead gets an activity score (1–10) based on how recently the job was posted and how many platforms it appeared on.
5. **Outreach** — Send a personalized email to the lead directly from the dashboard via Resend. Lead status updates to "Email Sent" automatically.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite |
| Backend | Node.js, Express |
| Database | Supabase (Postgres) |
| Scraping | Firecrawl, Apify |
| Email | Resend |

## Project Structure

```
Grapewine/
├── client/               # React frontend
│   └── src/
│       └── components/
│           ├── Dashboard.jsx         # Main layout
│           ├── SearchPanel.jsx       # Search inputs
│           ├── PipelineTab.jsx       # Lead table
│           └── EmailPreviewPanel.jsx # Email preview & send
└── server/               # Express backend
    ├── index.js
    ├── routes/
    │   └── api.js        # All API endpoints
    └── services/
        ├── scraperService.js    # Scrapes 6 job platforms
        ├── linkedinService.js   # Finds hiring managers via Apify
        ├── scoringService.js    # Activity score algorithm
        ├── emailService.js      # Sends outreach via Resend
        └── supabaseService.js   # DB client
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search` | Scrape, match, score, and save leads |
| GET | `/api/leads` | Fetch all leads |
| POST | `/api/send-email` | Send outreach email to a lead |
| PUT | `/api/leads/:id` | Update lead status |

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/rishabhhhh17/Grapewine.git
cd Grapewine
```

**2. Install dependencies**
```bash
cd server && npm install
cd ../client && npm install
```

**3. Configure environment**

Create `server/.env`:
```
FIRECRAWL_API_KEY=your_key
APIFY_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
GROQ_API_KEY=your_key
RESEND_API_KEY=your_key
PORT=3000
```

Create `client/.env.local`:
```
VITE_API_BASE=http://localhost:3000
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key
```

**4. Run**
```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend
cd client && npm run dev
```

The app runs at `http://localhost:5173` with the API at `http://localhost:3000`.

## Activity Score Algorithm

Scores are calculated out of 10:

- Posted 0–15 days ago → 8–10
- Posted 16–30 days ago → 5–7
- Posted 31–45 days ago → 2–4
- Posted 45+ days ago → 1

Each additional platform the job appears on adds **+1.5 points** (capped at 10), rewarding companies actively casting a wide net.
