# ReelForge Backend

Ye backend script/topic ko final video mein badalta hai:
`Topic → Gemini (script) → ElevenLabs (voiceover) → Pexels (visuals) → Shotstack (final render)`

## Local test (agar apne computer pe try karna ho)

```bash
npm install
cp .env.example .env   # phir .env mein apni 4 API keys daal dein
npm start
```

Server `http://localhost:3000` pe chalega. Test: browser mein `http://localhost:3000/health` kholein, `{"ok":true}` dikhna chahiye.

## Railway pe Deploy karna (production)

1. **Railway dashboard** kholein → **"New Project"** → **"Deploy from GitHub repo"**
   - Agar GitHub repo nahi bana to sabse pehle ye poora `reelforge-backend` folder GitHub pe upload karein (naya repository banayein, ye files push karein).
   - Ya Railway ka **"Empty Project"** bana kar **Railway CLI** (`railway up`) se seedha yahan se deploy kar sakte hain.

2. Deploy hone ke baad, project ke **"Variables"** tab mein jayein aur ye 6 environment variables add karein (values apni asli keys se bharein):

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | (aapki Gemini key) |
   | `ELEVENLABS_API_KEY` | (aapki ElevenLabs key) |
   | `PEXELS_API_KEY` | (aapki Pexels key) |
   | `SHOTSTACK_API_KEY` | (aapki Shotstack key) |
   | `SHOTSTACK_ENV` | `sandbox` (testing ke liye — baad mein `v1` kar dena jab paid plan lein) |
   | `PORT` | `3000` (Railway khud bhi assign kar deta hai, koi masla nahi) |

   ⚠️ **In .env wali file ko kabhi GitHub pe push na karein** — sirf Railway ke Variables tab mein keys dalein. `.gitignore` mein `.env` already excluded hai.

3. Railway khud detect kar lega ke ye Node.js app hai (`package.json` se) aur `npm install` + `npm start` chala dega. Deploy hone mein 1-2 minute lagta hai.

4. Deploy complete hone par, Railway ek public URL dega, jaisa:
   `https://reelforge-backend-production.up.railway.app`

5. Ye URL copy kar ke apni **website ke code** mein daalna hai — `index.html` mein search karein:
   ```js
   const API_BASE = window.REELFORGE_API_BASE || "";
   ```
   Isay yun badal dein (apna asli Railway URL daal kar):
   ```js
   const API_BASE = window.REELFORGE_API_BASE || "https://reelforge-backend-production.up.railway.app";
   ```

6. Website dobara deploy (Vercel pe re-upload) karein — bas! Ab "Generate Video Now" button real backend se connect ho jayega.

## Testing karte waqt zaroori baatein

- **Sandbox mode** (`SHOTSTACK_ENV=sandbox`): free hai, lekin videos pe halka watermark aata hai. Pehle isi se test karein.
- Jab sab kaam theek chale, Shotstack dashboard se paid plan lein aur `SHOTSTACK_ENV=v1` kar dein — watermark hat jayega.
- **Phase 1 sirf "Stock Footage" style support karta hai.** Agar user "AI Avatar", "Image to Video", ya "Mixed" select karega, backend automatically stock-footage pe fallback kar dega aur result mein ek note add kar dega. Ye Phase 2 mein add hoga.
- Lambi videos (20-30 min) render hone mein zyada time lengi (backend timeout: max ~10 minute wait per request — agar Shotstack render isse zyada le, error dikhega "timed out", is case mein render ID se manually Shotstack dashboard mein check kar sakte hain).

## Cost / Limits (free tiers)

| Service | Free limit |
|---|---|
| Gemini | Roz ki request limit hai, chhote scale ke liye kaafi |
| ElevenLabs | ~10,000 characters/month free |
| Pexels | 200 requests/hour |
| Shotstack | Sandbox unlimited (watermarked); production paid per render-minute |

Jab real users aana shuru hon, in sab ke paid plans lene padenge.
