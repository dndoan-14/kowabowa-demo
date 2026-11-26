# Kowabowa (demo)

A goal tracker for people at work: set goals, write short daily logs, mark achievements, and see which skills your work builds over time.

**Live demo:** _link coming soon_
**Demo account:** _email / password coming soon_

## Why

Most people only remember what they achieved when review season arrives. Kowabowa makes it a habit to log small wins against your goals every day, so the record is already there when you need it.

## What's in it

- **Goals:** create goals with start and end dates, see progress and log counts.
- **Daily logs:** quick entries linked to a goal and a skill; flag a log as an achievement; undo on delete.
- **Skills:** system skills plus your own; see how often each skill is used.
- **Profile and onboarding:** first goal set up during onboarding.

## Stack

- Frontend: Next.js 16, React 19, MUI, Tailwind CSS, deployed on Vercel
- Backend: Supabase (Postgres, Auth, Edge Functions in Deno/TypeScript)
- Security: Row Level Security on every table, so each user only sees their own data
- Built with Claude Code

## Team and my role

Built by a team of 4 as the final project of the *Iterating Product With AI* course (Breaking into Product Management, 2026).
I (Doan Dinh Duong) led the team. Team members: _[names to add]_.

This repository is my personal deployment of the team's work, combining the frontend and backend into one repo. The original team repositories are kept separately.

## Status

Demo project. It has not been launched to real users.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase URL and anon/publishable key
npm run dev                        # http://localhost:3000
```

Database schema and Edge Functions live in `supabase/` (`supabase db push`, `supabase functions deploy`).
