# Kadai Kural

A Tamil voice assistant that helps a small shop track stock and prepare supplier orders.

## The Problem

Kirana stores can lose sales when popular items run out. They can also tie up money in stock that does not sell. Checking every item manually takes time during a busy day. Kadai Kural demonstrates a voice based way to check stock and respond to low stock.

## How It Works

1. The shopkeeper records a sale on the billing screen. The FastAPI backend saves the sale in SQLite and reduces the product stock.
2. When stock reaches or falls below the product's configured minimum, Kadai Kural offers a reorder. The stock and threshold come from the database.
3. The shopkeeper speaks an order request. Gnani Prisma converts the recorded speech to text. The backend uses the local Ollama model through LangChain to interpret chat intent and generate shop replies.
4. Kadai Kural requests a supplier quote from the demo supplier records and asks the shopkeeper for approval. The simulated call uses backend order and quote data for the seller's dialogue.
5. After the shopkeeper confirms, the order status is saved. The shopkeeper can later say that the goods arrived; the backend marks the order received and adds its quantity to stock.
6. Gnani Timbre converts Kadai Kural's and the simulated wholesaler's replies to speech. The browser plays the audio in sequence.

## Features

- FastAPI backend with SQLite storage for products, sales, stock movements, supplier inventory, and orders.
- Dashboard, inventory, billing, purchase orders, and sales insights read from the shop database.
- Sample catalog with Ponni Rice, Cooking Oil, Sugar, Toor Dal, Filter Coffee, Bath Soap, Wheat Flour, and Milk 500ml.
- Billing reduces stock and the app flags products at or below their minimum stock threshold.
- Tamil voice interaction through Gnani Prisma speech recognition and Gnani Timbre speech synthesis.
- Voice controls with a Talk button, a “Hey Kural” wake phrase, and IDLE, LISTENING, THINKING, and SPEAKING states.
- Simulated two-phone wholesaler conversation with a database-backed quote and shopkeeper approval before order confirmation.
- Spoken incoming-stock handling for confirmed orders.
- Local Ollama model accessed through LangChain for intent understanding and shop replies.

## Demo

[DEMO VIDEO LINK]

## Tech Stack

- Python 3.12
- FastAPI
- SQLite
- LangChain and `langchain-ollama`
- Ollama with `llama3.2:latest` by default
- `httpx`, `python-dotenv`, and Pydantic
- HTML, CSS, and JavaScript in the browser
- Gnani Prisma v3 for speech-to-text
- Gnani Timbre v2.5 for text-to-speech

## Setup and Run

### 1. Create a Python environment and install packages

Run these commands in PowerShell from the project folder:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The included `run-demo.bat` can also create the environment, install requirements, and start the app on Windows.

### 2. Configure environment variables

Copy the example file and edit `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `GNANI_API_KEY` to your Gnani API key. The example also configures the Prisma model, Timbre voice and model, and Ollama URL and model. Keep the real key in `.env`; **never commit `.env` or expose the key on GitHub**. The repository's `.gitignore` excludes `.env`.

### 3. Start Ollama

Install and start Ollama separately. Pull the model configured in `.env` (the default is `llama3.2:latest`) and make sure Ollama is available at the configured `OLLAMA_BASE_URL`.

TODO: confirm the exact Ollama installation and model download commands for your operating system.

### 4. Start Kadai Kural

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) and allow microphone access in the browser. The app stores its SQLite database at `backend/data/kadai_kural.sqlite3` by default. Gnani voice features require a valid API key and network access.

## Limitations

- The wholesaler call is simulated. It does not place a real phone call or contact a supplier.
- Sri Lakshmi Stores supplier stock and wholesale prices are sample database records.
- Tamil transcription and speech quality depend on the configured Gnani services, microphone, and browser audio support.
- The demo contains one shop and one supplier, with eight sample products. It is not a multi-shop service or a complete accounting system.
- TODO: confirm behavior and hosting requirements for a public production deployment.

## Future Work

- Integrate real telephony for supplier calls.
- Connect the demo billing flow to a full billing or point-of-sale system.
- Add more languages.

## Built With AI

I designed the system flow, and AI coding tools helped build the code.

## Author

M Sadhamail, final-year B.E. CSE (AI/ML), Malnad College of Engineering, Hassan
