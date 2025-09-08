# BBB Business Engagement Opportunities




A Next.js application that helps BBB Business Engagement Coordinators find relevant business events and networking opportunities in their service areas.

## Features

- Find business events in Vermont, Maine, Rhode Island, and specific Massachusetts counties
- AI-powered event discovery using OpenAI's API
- Responsive design with BBB branding
- Event details including cost, location, audience, and BBB engagement opportunities

## Service Areas

- Vermont
- Maine
- Rhode Island
- Massachusetts Counties: Barnstable, Bristol, Dukes, Essex, Middlesex, Nantucket, Norfolk, Plymouth, Suffolk

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment

This app is configured for deployment on Vercel:

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Add your `OPENAI_API_KEY` environment variable in Vercel's dashboard
4. Deploy!

## BBB Topics Covered

- Creating and Enhancing Your BBB Business Profile
- Behind the Seal: Building Better Business -- A Conversation on Freedom, Leadership, and Growth
- Behind the Seal: Building Better Business -- Creating Events That Move People
- Behind the Seal: Building Better Business -- Launching a Women-Centered Business Hub
- Behind the Seal: Building Better Business -- Marketing That Shines
- Behind the Seal: Building Better Business -- Building a Business with Heart
- Behind the Seal: Building Better Business -- Mastering Business Insurance

## Tech Stack

- Next.js 14
- React 18
- Tailwind CSS
- Lucide React Icons
- OpenAI API
