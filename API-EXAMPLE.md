# API: Docs

The database covers: users, photos, preferences, swipes (Interaction), matches, messages, block/reports, refresh tokens. Below is the target specification with examples. Tags:
- [DONE] — already implemented
- [NEXT] — the logic is ready according to the scheme, we will implement the following commits

Base URL: http://localhost:3000  
Format: JSON. Time: ISO 8601. Auth: Bearer JWT (except /auth/* and /health). 
Mistakes: `{ "code": "STRING_CODE", "message": "human text" }`

## Health [DONE]
GET /health
- 200 → `{ "ok": true }`

curl:
```
curl http://localhost:3000/health
```

## Authentication [DONE]
POST /auth/register
- body: `{ "email": "a@b.c", "username": "alice", "password": "pass12345" }`
- 201 → `{ user: { id, email, username, onboardingDone }, access: "JWT" }`
- 400 BAD_INPUT, 409 ALREADY_EXISTS

POST /auth/login
- body: `{ "email": "a@b.c", "password": "pass12345" }`
- 200 → `{ user: { id, email, username, onboardingDone }, access: "JWT" }`
- 400 BAD_INPUT, 401 INVALID_CREDENTIALS

curl:
```
curl -X POST http://localhost:3000/auth/register \
 -H "Content-Type: application/json" \
 -d '{"email":"alice@example.com","username":"alice","password":"password123"}'
```

## Profile / Me [NEXT]
GET /me
- headers: Authorization: Bearer <token>
- 200 → `{ user: { id, email, username, name?, bio?, city?, onboardingDone, ... } }`
- 401 NO_TOKEN/INVALID_TOKEN, 404 NOT_FOUND

PATCH /me
- body (any fields): `{ "name": "Alice", "bio": "Hello", "city": "Wonderland" }`
- 200 → `{ user: {...updated} }`
- 400 BAD_INPUT

## Photo [NEXT]
GET /me/photos
- 200 → `{ photos: [{ id, url, order }] }`

POST /me/photos (multipart/form-data)
- file: `photo`
- 201 → `{ photo: { id, url, order } }`
- limits: up to 4 files, 10MB each

DELETE /me/photos/:id
- 204

Note: the database is unique `(userId, order)` the order of the photos is saved correctly.

## Preferences (Preferences) [NEXT]
GET /me/preferences
- 200 → `{ ageMin, ageMax, distanceKm, showGenders: ["male","female","other"], onlyVerified }`

PATCH /me/preferences
- body: any of the fields, for example
  `{ "ageMin": 20, "ageMax": 45, "showGenders": ["female"] }`
- 200 → `{ ...updated }`

## Tape (Feed) [NEXT]
GET /feed?limit=20&cursor=opaque
- takes into account the user's Preferences (age, showGenders, onlyVerified)
- 200 → 
```
{
  "items": [
    { "id": "...", "username": "bob", "name": "Bob", "city": "Builder", "photos":[{url,order}], "isVerified": false, "age": 30 }
  ],
  "nextCursor": "opaque" // if there are more
}
```

## Swipe/like/dislike (Interaction) [NEXT]
POST /like
- body: `{ "toUserId": "xxx", "isLike": true }`
- 200 → 
```
{
  "ok": true,
  "matched": true|false,
  "matchId": "..." // if mutual like
}
```
Notes:
- Uniqueness in the database `(fromUserId, toUserId)` — the action cannot be repeated, only changed via PATCH (optional).
- With mutual like, we create a Match; the pair is normalized (min(id), max(id)).

## Matches [NEXT]
GET /matches?limit=20&cursor=opaque
- 200 → 
```
{
  "items": [
    { "id":"matchId", "peer": { "id":"...", "username":"bob", "name":"Bob", "photos":[...] }, "lastMessageAt":"2025-10-26T16:00:00Z" }
  ],
  "nextCursor":"opaque"
}
```

## Messages [NEXT]
GET /matches/:id/messages?limit=30&cursor=opaque
- 200 → 
```
{
  "items":[
    { "id":"...", "senderId":"...", "text":"Hi", "createdAt":"..." }
  ],
  "nextCursor":"opaque"
}
```

POST /matches/:id/messages
- body: `{ "text": "Hello!" }`
- 201 → `{ "id":"...", "senderId":"me", "text":"Hello!", "createdAt":"..." }`

## Blockages [NEXT]
POST /blocks
- body: `{ "blockedUserId": "..." }`
- 201 → `{ "id":"...", "blockedUserId":"..." }`

DELETE /blocks/:blockedUserId
- 204

Эффекты:
- the block hides the user in the feed
- the block closes the possibility of new messages
- (optional) hides the last chat in the list of matches

## Reports [NEXT]
POST /reports
- body: `{ "reportedUserId":"...", "reason":"spam" }`
- 201 → `{ "id":"...", "reportedUserId":"...", "createdAt":"..." }`

## Tokens [NEXT]
(there is a refreshToken model; we will add endpoints if necessary)
- POST /auth/refresh → `{ access }`
- POST /auth/logout → 204

## Constants and enumerations
Gender: `"male" | "female" | "other"`  
Preferences.showGenders: `Gender[]`

## Error format (typical)
- 400 BAD_INPUT — request body validation
- 401 NO_TOKEN / INVALID_TOKEN — no token/invalid
- 403 FORBIDDEN — no rights
- 404 NOT_FOUND — resource not found/not yours
- 409 ALREADY_EXISTS — The uniqueness conflict
- 500 INTERNAL — unexpected error

## A quick manual script (curl)
1) Registration → login:
```
ACCESS=$(curl -s -X POST http://localhost:3000/auth/login \
 -H "Content-Type: application/json" \
 -d '{"email":"alice@example.com","password":"password123"}' | jq -r .access)
```

2) Profile:
```
curl -H "Authorization: Bearer $ACCESS" http://localhost:3000/me
```

3) Like:
```
curl -X POST http://localhost:3000/like \
 -H "Authorization: Bearer $ACCESS" \
 -H "Content-Type: application/json" \
 -d '{"toUserId":"<OTHER_USER_ID>","isLike":true}'
```

4) Message:
```
curl -X POST http://localhost:3000/matches/<MATCH_ID>/messages \
 -H "Authorization: Bearer $ACCESS" \
 -H "Content-Type: application/json" \
 -d '{"text":"Hello!"}'
```