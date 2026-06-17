# Personal Memory App

Next.js App Router backend and Expo React Native mobile app for saving and searching personal memories.

## Backend Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Set these values in `.env.local`:

```bash
MONGO_URI=
MEMORY_API_KEY=
```

The local Next.js server runs at `http://localhost:3000` by default.

## Backend Routes

All API routes require the `x-api-key` header.

- `POST /api/assistant/command`
- `GET /api/memories`
- `POST /api/memories`
- `GET /api/memories/search?q=term`
- `GET /api/memories/:id`
- `PATCH /api/memories/:id`
- `DELETE /api/memories/:id`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/memories`
- `GET /api/extension/projects`
- `POST /api/extension/memories`
- `POST /api/extension/screenshots`

Memories can optionally be attached to a project with `projectId` and typed with `kind`: `note`, `task`, `work_done`, `requirement`, or `credential`.

Credential entries are stored like normal memory text in the current version. Do not store real passwords, tokens, or production secrets until encryption is added.

## Assistant Commands

The assistant endpoint accepts command-style input and natural language:

- `@project HRMS` or `@switch HRMS` sets the active project.
- `@current` returns the active project.
- `@task Implement semantic search` creates a pending task under the active project.
- `@note Cache employee data for 5 minutes` creates a project note.
- `@requirement JWT token must refresh before expiry` creates a project requirement.
- `@credential Staging appKey must match config file` creates a project credential note.
- `@work Finished employee cache integration` creates a project work-done note.
- `@meeting Client discussion Friday 3PM` creates a project meeting.
- `@summary` returns project details, pending tasks, completed tasks, recent meetings, and recent notes.
- `@tasks`, `@notes`, and `@meetings` list items for the active project.
- `@memory My passport expires in 2032` saves a standalone memory.
- `@find jwt` searches projects, tasks, meetings, notes, and memories.
- `@projects` and `@memories` list projects or recent standalone memories.
- `@delete-task jwt` and `@delete-memory passport` search first, then delete if exactly one item matches.

Natural language examples also work:

- `work on hrms`
- `switch to activex`
- `open natiks`
- `remember this: Japan trip budget is 2 lakh`
- `what do I know about jwt`
- `any tasks in hrms`

## Test With Curl

Set your API key first:

```bash
API_KEY=replace-with-your-memory-api-key
BASE_URL=http://localhost:3000
```

Run an assistant command:

```bash
curl -X POST "$BASE_URL/api/assistant/command" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-session-id: default" \
  -d '{
    "input": "@project HRMS"
  }'
```

Create a task in the active project:

```bash
curl -X POST "$BASE_URL/api/assistant/command" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-session-id: default" \
  -d '{
    "input": "@task Implement semantic search"
  }'
```

Save a standalone memory:

```bash
curl -X POST "$BASE_URL/api/assistant/command" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-session-id: default" \
  -d '{
    "input": "@memory My passport expires in 2032"
  }'
```

Search everything:

```bash
curl -X POST "$BASE_URL/api/assistant/command" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "x-session-id: default" \
  -d '{
    "input": "@find jwt"
  }'
```

Create a memory:

```bash
curl -X POST "$BASE_URL/api/memories" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "First memory",
    "content": "This is a test memory from curl.",
    "category": "personal",
    "kind": "note",
    "tags": ["test", "curl"],
    "source": "manual"
  }'
```

Create a project:

```bash
curl -X POST "$BASE_URL/api/projects" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "name": "Natiks",
    "description": "Project notes, tasks, requirements, and work log"
  }'
```

List projects:

```bash
curl "$BASE_URL/api/projects" \
  -H "x-api-key: $API_KEY"
```

Save a project task or requirement:

```bash
PROJECT_ID=replace-with-project-id

curl -X POST "$BASE_URL/api/memories" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "Set up JWT auth",
    "content": "Add login token validation and refresh flow.",
    "category": "work",
    "kind": "requirement",
    "projectId": "'$PROJECT_ID'",
    "tags": ["jwt", "auth"]
  }'
```

List memories:

```bash
curl "$BASE_URL/api/memories" \
  -H "x-api-key: $API_KEY"
```

Search memories:

```bash
curl "$BASE_URL/api/memories/search?q=curl" \
  -H "x-api-key: $API_KEY"
```

List memories for one project:

```bash
curl "$BASE_URL/api/projects/$PROJECT_ID/memories" \
  -H "x-api-key: $API_KEY"
```

List projects for the Chrome extension:

```bash
curl "$BASE_URL/api/extension/projects" \
  -H "x-api-key: $API_KEY"
```

Save selected text or a webpage from the Chrome extension:

```bash
curl -X POST "$BASE_URL/api/extension/memories" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "type": "note",
    "content": "Selected text from a webpage",
    "note": "Optional user note",
    "projectId": null,
    "source": {
      "type": "chrome_extension",
      "title": "Example Page",
      "url": "https://example.com",
      "capturedAt": "2026-06-17T10:00:00.000Z"
    }
  }'
```

Upload a screenshot from the Chrome extension:

```bash
curl -X POST "$BASE_URL/api/extension/screenshots" \
  -H "x-api-key: $API_KEY" \
  -F "image=@/path/to/screenshot.png" \
  -F "type=note" \
  -F "note=Optional screenshot note" \
  -F "projectId=" \
  -F "sourceTitle=Example Page" \
  -F "sourceUrl=https://example.com" \
  -F "capturedAt=2026-06-17T10:00:00.000Z"
```

Get a memory by id:

```bash
MEMORY_ID=replace-with-memory-id

curl "$BASE_URL/api/memories/$MEMORY_ID" \
  -H "x-api-key: $API_KEY"
```

Update a memory:

```bash
curl -X PATCH "$BASE_URL/api/memories/$MEMORY_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "category": "updated",
    "tags": ["updated", "memory"]
  }'
```

Delete a memory:

```bash
curl -X DELETE "$BASE_URL/api/memories/$MEMORY_ID" \
  -H "x-api-key: $API_KEY"
```

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Add these environment variables in Vercel Project Settings:

```bash
MONGO_URI=
MEMORY_API_KEY=
```

4. Deploy. Your API will be available at:

```bash
https://your-vercel-domain.vercel.app/api/memories
```

Privacy policy page:

```bash
https://your-vercel-domain.vercel.app/privacy
```

## Custom GPT Action Notes

Use `openapi.json` as the Action schema. In the Custom GPT instructions, tell the GPT:

```text
For any memory, project, task, meeting, note, search, summary, or delete request, call runAssistantCommand with the user's exact message in input.

Do not say "I'll check" before using the action. Call runAssistantCommand first, then answer using its message and data.

Use the same x-session-id value across messages so the active project remains selected.
```

## Expo Mobile App

The Expo React Native app lives in `mobile/`.

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

For the deployed backend, set these values in `mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=https://your-vercel-domain.vercel.app/api/memories
EXPO_PUBLIC_MEMORY_API_KEY=replace-with-your-memory-api-key
```

For local development, use your local Next.js API endpoint. Expo Go on a physical device needs your computer's LAN IP address, for example `http://192.168.1.5:3000/api/memories`. Android emulators often need `http://10.0.2.2:3000/api/memories`.

Mobile scripts:

- `npm start`
- `npm run ios`
- `npm run android`
- `npm run web`
- `npm run typecheck`

## Chrome Extension

The Chrome extension lives in `apps/chrome-extension`.

It can:

- Save selected text from any webpage with the right-click menu.
- Save the current page from the popup.
- Capture the visible tab screenshot from the popup.
- Save as `Note`, `Task`, `Project`, or `Reminder`.
- Attach the saved item to a project, or save with `No project`.

Backend URL config:

```js
// apps/chrome-extension/config.js
globalThis.MEMORY_ASSISTANT_CONFIG = {
  BACKEND_URL: 'https://memory-green-kappa.vercel.app'
};
```

For local backend testing, change `BACKEND_URL` to `http://localhost:3000`. The manifest already allows the deployed URL, `localhost:3000`, and `localhost:5000`.

Load it in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `apps/chrome-extension`.
5. Open the extension popup.
6. Enter the backend URL and your `MEMORY_API_KEY`.

The API key is stored in `chrome.storage.local` under the extension's private storage. The extension only sends page content after an explicit user action: right-click save, Save Page, or Capture Screenshot.
