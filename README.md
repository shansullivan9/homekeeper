# HomeKeeper 🏠

A shared home maintenance management PWA built for couples. Track tasks, recurring maintenance, appliances, expenses, and your home's complete history — all from your iPhone home screen.

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Hosting**: Vercel
- **PWA**: next-pwa
- **State**: Zustand

---

## 🚀 Deploy in Under 10 Minutes

### Step 1: Create Supabase Project (2 min)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project**
3. Name it `homekeeper`, set a database password, choose a region
4. Wait for the project to finish provisioning (~30 seconds)
5. Go to **Settings → API** and copy:
   - `Project URL` (this is your `NEXT_PUBLIC_SUPABASE_URL`)
   - `anon/public` key (this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Step 2: Run Database Schema (2 min)

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase-schema.sql` from this project
4. Paste it into the SQL editor
5. Click **Run** (the green play button)
6. You should see "Success. No rows returned" — that's correct

> **Important**: After running the schema, go to **Database → Replication** and ensure the `tasks` and `task_history` tables are enabled for realtime.

### Step 3: Configure Supabase Auth (1 min)

1. Go to **Authentication → Providers**
2. Ensure **Email** is enabled (it is by default)
3. For instant signup (no email verification), go to **Authentication → Settings** and uncheck "Enable email confirmations" during development

### Step 4: Deploy to Vercel (3 min)

1. Push this project to a GitHub repository:
   ```bash
   cd homekeeper
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create homekeeper --public --push
   ```
   Or create a repo on github.com and push manually.

2. Go to [vercel.com](https://vercel.com)
3. Click **Add New → Project**
4. Import your GitHub repository
5. In the **Environment Variables** section, add:
   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
6. Click **Deploy**
7. Wait ~60 seconds for the build to complete

### Step 5: Generate App Icons (1 min)

Before deploying (or update after), you need PNG icons:

**Easiest method**: Go to [realfavicongenerator.net](https://realfavicongenerator.net), upload `public/icons/icon.svg`, and download the generated icons. Place `icon-192.png` and `icon-512.png` in `public/icons/`.

**Or use ImageMagick**:
```bash
convert -background none -resize 192x192 public/icons/icon.svg public/icons/icon-192.png
convert -background none -resize 512x512 public/icons/icon.svg public/icons/icon-512.png
```

### Step 6: Install on iPhone (30 sec)

1. Open Safari on your iPhone
2. Navigate to your Vercel deployment URL
3. Tap the Share button (square with arrow)
4. Tap **"Add to Home Screen"**
5. Name it "HomeKeeper" and tap Add
6. Open it from your home screen — it runs as a native app!

---

## 📱 How to Use

### First Time Setup

1. Open the app and **Create Account** with your email
2. You'll be prompted to set up your **Home Profile**
3. Fill in your property details (year built, HVAC, etc.)
4. The app generates **suggested maintenance tasks** based on your home
5. Accept or dismiss suggestions from the dashboard

### Invite Your Partner

1. Go to **Settings**
2. Copy the **Invite Code** shown under Household
3. Send the code to your partner
4. They sign up, go to Settings → Join Another Home, and enter the code
5. You now share a dashboard with realtime sync!

### Daily Use

- **Dashboard**: See overdue, upcoming, and due-this-week tasks
- **Calendar**: Monthly view with task dots on dates
- **+ Add**: Create new tasks with recurrence, categories, costs
- **History**: Browse all completed tasks with search
- **Settings**: Manage household, appliances, expenses, timeline

---

## 📁 Project Structure

```
homekeeper/
├── app/
│   ├── layout.tsx            # Root layout with PWA meta
│   ├── page.tsx              # Root redirect
│   ├── globals.css           # Global styles
│   ├── auth/page.tsx         # Login/Signup
│   ├── dashboard/
│   │   ├── layout.tsx        # App shell wrapper
│   │   └── page.tsx          # Main dashboard
│   ├── calendar/page.tsx     # Monthly calendar view
│   ├── add-task/page.tsx     # Create/edit tasks
│   ├── history/page.tsx      # Completed task history
│   ├── settings/page.tsx     # Settings & household
│   ├── home-profile/page.tsx # Home setup/edit
│   ├── appliances/page.tsx   # Appliance records
│   ├── expenses/page.tsx     # Yearly expense summary
│   └── timeline/page.tsx     # House timeline
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx      # Auth wrapper + loading
│   │   ├── BottomNav.tsx     # iOS-style tab bar
│   │   └── PageHeader.tsx    # Sticky header
│   ├── tasks/
│   │   └── TaskCard.tsx      # Task list item
│   └── dashboard/
│       └── SuggestionBanner.tsx
├── lib/
│   ├── supabase-browser.ts   # Browser Supabase client
│   ├── supabase-server.ts    # Server Supabase client
│   ├── store.ts              # Zustand global state
│   ├── types.ts              # TypeScript interfaces
│   └── constants.ts          # Colors, labels, helpers
├── hooks/
│   └── useAppInit.ts         # Data loading + realtime
├── middleware.ts              # Auth route protection
├── public/
│   ├── manifest.json         # PWA manifest
│   └── icons/
│       └── icon.svg          # App icon source
├── supabase-schema.sql       # Full database schema
├── next.config.js            # Next.js + PWA config
├── tailwind.config.js
└── package.json
```

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | User display names, emails (extends auth.users) |
| `homes` | Property details, features, invite codes |
| `home_members` | Links users to homes with roles |
| `categories` | Task categories (9 defaults + custom) |
| `tasks` | All tasks with recurrence, priority, costs |
| `task_history` | Completed task log with who/when/cost |
| `appliances` | Appliance records with warranty tracking |
| `timeline_events` | House timeline (auto + manual entries) |
| `notification_preferences` | Per-user notification settings |

Key features:
- **Row Level Security** on all tables — users only see their household's data
- **`complete_task()` function** — atomically completes a task, logs history, creates timeline entry, and auto-schedules next occurrence for recurring tasks
- **`generate_suggestions()` function** — creates recommended tasks based on home profile
- **Realtime** enabled on tasks and history for instant sync

---

## 🔧 Local Development

```bash
# Clone and install
git clone <your-repo>
cd homekeeper
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Features Summary

- ✅ Shared household with invite codes
- ✅ Full task CRUD with recurrence (one-time through custom days)
- ✅ Auto-scheduling of next occurrence on completion
- ✅ Dashboard with overdue/due-soon/upcoming sections
- ✅ Monthly calendar view
- ✅ Task completion history with search
- ✅ Maintenance recommendation engine based on home profile
- ✅ Appliance & system records with warranty tracking
- ✅ Expense tracking with yearly category breakdown
- ✅ House timeline with export to CSV
- ✅ Realtime sync between household members
- ✅ PWA: installable, offline-cached, full-screen
- ✅ iOS-native look and feel
- ✅ Auth with email login via Supabase
- ✅ Row-level security on all data
