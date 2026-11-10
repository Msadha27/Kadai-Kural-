# Kadai Kural — Tamil voice shop assistant

Kadai Kural is a Tamil-first voice assistant for a small shop. Its dashboard, billing, sales insights, procurement and voice assistant all read the same SQLite shop database. Gnani Prisma handles speech recognition and Gnani Timbre handles speech output. Stock facts and supplier quotes come from the database.

## Run locally on Windows

1. Put the Gnani API key in the local `.env` file as `GNANI_API_KEY=...`. Keep `.env` private. The browser never sees the key.
2. Run `.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000` from this folder. If the virtual environment is not present, first run `py -3 -m venv .venv` and `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`.
3. Visit http://localhost:8000. Allow microphone access. The page starts idle; press **Talk** once to unlock audio and begin, or say **Hey Kural** after allowing the microphone.

Prisma and Timbre voice calls go to Gnani's hosted API. Kadai Kural uses the configured Ollama model for intent understanding and shop replies. The simulated seller uses verified backend quote and order facts for its lines, so it cannot repeat a generic sales introduction or invent prices.

## End-to-end demo path

1. The screen starts in **IDLE** and does not greet by itself. The wake listener checks short speech segments with Gnani Prisma for **Hey Kural**. The large **Talk** button starts the same flow manually.
2. It speaks one short greeting, then listens continuously for commands until **Talk** is pressed to stop. The microphone is stopped while Prisma processes a command and while Timbre audio plays. The four state changes appear on screen and in the browser console.
3. After greeting, Kadai Kural reads the current product stock from SQLite. Ask about rice, sugar, cooking oil, Toor Dal or the full stock list. Use Billing to add any catalog item to a bill. A sale reduces that item’s database stock; reaching its configured minimum triggers a restock offer.
4. Say `order 10 bags of rice` or `10 mutta order pannu` to start the supplier call. The current demo catalog also supports Sugar, Cooking Oil and Toor Dal. Kadai Kural places the call and speaks the request in its Tamil voice. The simulated wholesaler answers with the database quote in a different voice. Kural returns to the dashboard and asks the owner to confirm or cancel. If approved, the order is saved as confirmed, Kural calls the wholesaler again to finalize it, then returns to the dashboard with the result. Stock stays unchanged until goods are received.
5. After an order is confirmed, say `அரிசி order வந்துடுச்சு` (or `order received`) to mark that order received and update stock. For an unlinked stock receipt, the app asks for the quantity and confirmation before adding it.

## Two-phone wholesaler call

Say `order 10 bags of rice` or `10 mutta order pannu` while Kural is listening, or open **Wholesaler call** and click **Call wholesaler**. For an order, the two phone mockups show Kural calling the wholesaler; Kural speaks the buyer request, the seller speaks a database-backed quote, and Kural tells the seller it will check with the owner. Kural then returns to the dashboard and asks the owner to approve the quoted price. A spoken yes confirms the order and triggers a short second call to tell the seller; a spoken no cancels it. Later, say `அரிசி order வந்துடுச்சு` to mark the confirmed order received and update stock.

## Deploy with Docker Compose

This deployment runs the FastAPI app and Ollama as separate containers. The app uses SQLite in a persistent Docker volume; the Gnani key is read from a local `.env` file and is not copied into the image or sent to the browser.

1. Copy `.env.example` to `.env` and add the real `GNANI_API_KEY` value. Keep `.env` private and out of source control.
2. Install Docker Desktop, then run `docker compose up --build -d` from this directory.
3. Download the local language model once: `docker compose exec ollama ollama pull llama3.2:latest`.
4. Open `http://localhost:8000`. Check service status with `docker compose ps` and logs with `docker compose logs -f app`.
5. Stop the demo with `docker compose down`. Shop data stays in the `kadai_data` volume. To remove the data too, use `docker compose down -v`.

Set `APP_PORT` in `.env` to change the published local port. Set `OLLAMA_MODEL` there to use another model, and pull that same model into the Ollama container. A hosted deployment can build the included `Dockerfile`; configure `GNANI_API_KEY`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` as private environment variables and attach persistent storage at `/data`.

**Before exposing it to the public internet:** this demo has no user login and is designed for one shop and one app process. Put it behind an access-control layer (for example, your hosting provider's protected preview or an authenticated reverse proxy), use HTTPS, and set usage limits for the Gnani key. Do not publish an unauthenticated instance with a live API key.

## API and storage

- `backend/main.py` — FastAPI routes, SQLite stock/billing, and server-side Gnani Prisma/Timbre calls.
- `bridge.js` — the four-state voice loop, microphone capture, transcript gating, and sequential speech playback.
- `app.js` — dashboard, database-backed catalog, billing, purchase orders and sales insights.
- `backend/data/kadai_kural.sqlite3` — created automatically for persistent shop data.
- `.env` — local secrets and Ollama/Gnani settings; do not commit or share it.
- `requirements.txt` — backend dependencies.

Voice requests use Gnani's `X-API-Key-ID` header, Prisma v3 REST endpoint (`/stt/v3`) for captured clips, and Timbre REST inference (`/api/v1/tts/inference`) for each reply. Kural and seller audio are queued sequentially through Timbre. See [Prisma v3 overview](https://www.gnani.ai/resources/prisma-v3), [Timbre REST API](https://docs.gnani.ai/api/TTS/tts-inference), and [Timbre voices](https://docs.gnani.ai/api/TTS/available-voices).

## Demo boundaries

The wholesaler call is simulated; it does not contact a real supplier. Sri Lakshmi Stores availability and wholesale prices are demo records. Voice recognition and speech both require a Gnani key with the respective service access and browser microphone permission. A browser may require one initial click before it permits automatic audio playback. This is a single-shop demo, not GST billing software or a production multi-user system.
