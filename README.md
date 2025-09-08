=== file: README.md (updated) ===
# BBB Engagement Opportunities

A Next.js application that helps BBB Engagement Coordinators find relevant **business** and **public/community** events in their service areas.

## What’s New

- **Public Engagement Opportunities mode** (festivals, fairs, town days, parades, library/community programs, university public lectures, shred days, scam-prevention talks, senior expos, etc.)
- Homepage **toggle** between **Business** and **Public** searches
- New API route: `/api/find-public-events` (returns real public-facing events with an added `topic` field from a BBB-friendly taxonomy)

## Features

- Find events in Vermont, Maine, Rhode Island, and specific Massachusetts counties
- AI-assisted event discovery using OpenAI’s API
- Responsive design with BBB branding
- Event details including date, time, location, cost, audience, contact, link, and “Why BBB should be there”
- **Public mode** includes a `topic` label (e.g., Consumer Education, Scam Prevention, Community Festival/Fair)

## Service Areas

- Vermont
- Maine
- Rhode Island
- Massachusetts Counties: Barnstable, Bristol, Dukes, Essex, Middlesex, Nantucket, Norfolk, Plymouth, Suffolk

## Prerequisites

- Node.js **18.17+**
- npm **9+** (or pnpm/yarn equivalent)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
