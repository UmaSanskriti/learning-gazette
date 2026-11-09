# The Learning Gazette

Harvard AI in Education Club · Fall 2026

As president of Harvard's AI in Education Club, I built this newsroom to turn a week of scattered reporting into a newsletter members could review in one place.

Specialist agents collect stories, check sources and draft an issue. A live dashboard shows their progress, and an editor approves publication. Failed runs resume without repeating completed work.

**Stack:** TypeScript, React, Express and Claude. Includes a mock mode that needs no model credentials.

## Try it

Requires Node.js 20 or later.

```sh
npm ci
npm run demo
npm run dev
```

The dashboard runs at `http://localhost:5173`. Mock issues are labelled as samples. A live run needs your own model credentials; copy `.env.example` to `.env` and choose the API provider in the dashboard. Live calls incur provider charges.

## Explore

- [Pipeline](src/core/runner.ts): orchestration, retries and editorial approval.
- [Prompts](config/prompts/): collection, verification and editing.
- [Dashboard](src/dashboard/): live workflow and agent output.
- [Renderer](src/core/render/): newsletter HTML and charts.

Source checking is an agent task, not a guarantee of factual accuracy. Read the issue before publishing. The server is intended for local use.

[Project context](SOURCE.md)
