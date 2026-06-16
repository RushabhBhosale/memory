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

All memory routes require the `x-api-key` header.

- `GET /api/memories`
- `POST /api/memories`
- `GET /api/memories/search?q=term`
- `GET /api/memories/:id`
- `PATCH /api/memories/:id`
- `DELETE /api/memories/:id`

## Test With Curl

Set your API key first:

```bash
API_KEY=replace-with-your-memory-api-key
BASE_URL=http://localhost:3000
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
    "tags": ["test", "curl"],
    "source": "manual"
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
