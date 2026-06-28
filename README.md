# 🧠 SkillGap Analyzer V2 · Career Intelligence System

A production-grade, dual-backend AI platform designed to semantically analyze engineering resumes, map skill gaps against real-time market demands, and generate personalized learning roadmaps. 

### ✨ Features

| Feature | What it does | Backend Endpoint | 📝 Notes |
| :--- | :--- | :--- | :--- |
| **📄 Resume Parsing** | Securely extracts skills & experience from uploaded files | `POST /parse-resume` | Uses PDF.js & Gemini |
| **🎯 Role Suggestions** | Recommends realistic job roles based on parsed skills | `POST /suggest-roles` | AI-driven fallback system |
| **📊 Semantic Mapping** | Calculates cosine similarity between user & market skills | `POST /semantic-match` | Runs on Python ML Engine |
| **🛣️ Career Roadmap** | Generates visual gap analysis via Chart.js radar/doughnut charts | `POST /analyze` | Requires Auth / Guest Mode |
| **🃏 Mock Tests** | Generates role-specific MCQ interview questions | `POST /generate-mock-test` | Includes scoring & feedback |
| **💾 History Tracking** | Persists past analyses with favoriting capabilities | `GET /api/history` | SQLite with enforced FKs |

### ➕ Additional Capabilities

* **Multi-Model AI Fallback:** Intelligently switches between `gemini-3.5-flash`, `gemini-3-flash-preview`, and `gemini-flash-latest` to manage rate limits.
* **Dual-Backend Architecture:** Offloads heavy NLP vector embeddings to a dedicated Python microservice.
* **Secure Authentication:** JWT-based session management with `bcrypt` password hashing.
* **Client-Side PDF Processing:** Uses Web Workers to extract text before sending to the server, reducing payload size.
* **Dynamic Visualizations:** Responsive Chart.js integration for proficiency domain mapping.

### 🧱 Tech Stack

* **Frontend:** Vanilla JavaScript (ES6), HTML5, CSS3, Chart.js, PDF.js
* **API Gateway:** Node.js, Express.js, JWT, bcrypt
* **Database:** SQLite3 (Referential Integrity Enabled)
* **ML Microservice:** Python 3, FastAPI, Uvicorn, SentenceTransformers (`all-MiniLM-L6-v2`)

---

### 🚀 Quick Start

This project requires **two** servers running simultaneously. 

#### 1. Start the Machine Learning Engine (Python)
The ML Engine handles the heavy lifting for semantic text embeddings.
```bash
cd ml_service
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
python ml_engine.py
```
Runs at: http://127.0.0.1:50505


### 2. Start the API Gateway (Node.js)
The Gateway handles routing, authentication, and LLM communication.
```bash
cd server
npm install
```

### 3. Configure Environment Variables
Create a .env file in the /server directory. Never commit this file.
```bash
GEMINI_API_KEY=your_google_gemini_key_here
JWT_SECRET=your_super_secret_jwt_string
ML_ENGINE_SECRET=super_secret_internal_key_123
ML_ENGINE_URL=[http://127.0.0.1:50505/semantic-match](http://127.0.0.1:50505/semantic-match)
PORT=3000
```

### 4. Run the Application
```bash
node index.js
```
Access the frontend at: http://localhost:3000

---

### 🧩 API Service Layer

#### Node.js Gateway Endpoints (Port 3000)
* `POST /register` → Creates user & hashes password.
* `POST /login` → Issues JWT session token.
* `GET /auth/me` → Validates token state.
* `POST /parse-resume` → Expects raw text, returns structured JSON skills.
* `POST /suggest-roles` → Returns AI-generated target roles.
* `POST /analyze` → Orchestrates Gemini market demands + Python ML matching.
* `GET /api/history` → Retrieves user's saved SQLite roadmaps.
* `POST /generate-mock-test` → Generates dynamic MCQs for the target role.

#### Python ML Engine Endpoints (Port 50505)
* `POST /semantic-match` → Requires `x-api-key` header. Expects `user_skills` (List) and `market_skills` (List of Objects). Returns cosine similarity matrices, gaps, and domain weights.

---

### 🛡️ Error Handling & Security

* **API Key Protection:** Inter-server communication (Node <-> Python) is locked behind a strict `x-api-key` header.
* **Rate Limit Evasion:** The AI service layer automatically iterates through a descending list of 7 different Gemini model variants if quota errors occur.
* **Input Sanitization:** Frontend inputs strictly escape HTML to prevent XSS during history rendering.
* **Referential Integrity:** SQLite `PRAGMA foreign_keys = ON` combined with `ON DELETE CASCADE` prevents orphaned history records.

---

### 🔮 Future Improvements

* Migration from SQLite to PostgreSQL for distributed hosting.
* Integration of OAuth 2.0 (Google/GitHub login).
* Exporting roadmaps directly to PDF.
* Adding caching (Redis) for duplicate role analyses to save LLM tokens.

### 📄 License
MIT License

