# Personal Memory Backend

Express and MongoDB backend for a personal memory app.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set `MONGO_URI` and `MEMORY_API_KEY` in `.env`.

## Routes

All memory routes require the `x-api-key` header.

- `POST /api/memories`
- `GET /api/memories`
- `GET /api/memories/search?q=term`
- `GET /api/memories/:id`
- `DELETE /api/memories/:id`

Health check:

- `GET /health`

## Test With Curl

Set your API key first:

```bash
API_KEY=replace-with-your-memory-api-key
BASE_URL=http://localhost:5000
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

Delete a memory:

```bash
curl -X DELETE "$BASE_URL/api/memories/$MEMORY_ID" \
  -H "x-api-key: $API_KEY"
```

## Expo Mobile App

The Expo React Native app lives in `mobile/`.

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

Set these values in `mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:5000
EXPO_PUBLIC_MEMORY_API_KEY=replace-with-your-memory-api-key
```

If you run the app on a physical device, replace `localhost` with your computer's LAN IP address. Android emulators often need `http://10.0.2.2:5000`.

Mobile scripts:

- `npm start`
- `npm run ios`
- `npm run android`
- `npm run web`
- `npm run typecheck`
