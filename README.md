# 📚 Alexandria — Library AI Assistant

An AI-powered library assistant web application built with **Python Flask** and **IBM Watsonx.ai** (IBM Granite models). Discover books, generate personalized reading plans, search the library catalogue, and chat with an intelligent AI librarian.

---

## 🌐 Live Demo

**Live Website:** https://library-ai-assistance.onrender.com

## ✨ Features

| Feature | Description |
|---|---|
| 💬 AI Chat | Real-time conversation powered by IBM Granite |
| 📖 Book Recommendations | Personalized suggestions by interest & level |
| 🗓️ Reading Plans | AI-generated week-by-week plans |
| 🔍 Smart Search | AI-powered book & topic search |
| 📋 Reading History | Track books you've read |
| ❤️ Favorites | Save books for later |
| 🎓 Learning Resources | Curated courses, platforms, and more |
| 🌙 Dark Mode | Full dark/light theme with persistence |
| 📱 Responsive | Works on desktop, tablet, and mobile |

---

## 🏗️ Project Structure

```
library-ai-assistant/
├── app.py                  # Flask backend + IBM Watsonx.ai integration
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
├── .env                    # Your credentials (never commit this!)
├── templates/
│   └── index.html          # Main SPA template
└── static/
    ├── css/
    │   └── style.css       # Styles with dark mode & animations
    └── js/
        └── app.js          # Frontend logic
```

---

## ⚙️ Prerequisites

- Python **3.11+**
- An **IBM Cloud account** with access to **Watsonx.ai**
- IBM Watsonx.ai **Project ID**
- IBM Cloud **API Key**

---

## 🚀 Quick Start

### 1. Clone / Download the project

```bash
git clone <repo-url>
cd library-ai-assistant
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
# Copy the example file
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
IBM_CLOUD_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
FLASK_SECRET_KEY=any-random-secret-string
FLASK_DEBUG=False
FLASK_PORT=5000
```

#### How to get IBM Cloud credentials

1. Log in to [IBM Cloud](https://cloud.ibm.com)
2. Go to **Manage → Access (IAM) → API keys** → Create an API key
3. Open [IBM Watsonx.ai](https://dataplatform.cloud.ibm.com/wx/home)
4. Create or open a project → copy the **Project ID** from **Manage → General**
5. Set `WATSONX_URL` to the region closest to you:
   - US: `https://us-south.ml.cloud.ibm.com`
   - EU: `https://eu-de.ml.cloud.ibm.com`
   - UK: `https://eu-gb.ml.cloud.ibm.com`
   - JP: `https://jp-tok.ml.cloud.ibm.com`

### 5. Run the application

```bash
python app.py
```

Open your browser at **[http://localhost:5000](http://localhost:5000)**

---

## 🎨 Customizing the AI Assistant

Open `app.py` and find the **`AGENT_INSTRUCTIONS`** block near the top of the file:

```python
AGENT_INSTRUCTIONS = """
You are "Alexandria" — a friendly, knowledgeable, and encouraging AI Library Assistant…
"""
```

You can customize:

| Setting | What to change |
|---|---|
| **Name & persona** | Change "Alexandria" and the personality description |
| **Tone** | Adjust the PERSONALITY & TONE section |
| **Genres** | Edit PREFERRED GENRES & FOCUS AREAS |
| **Recommendation style** | Modify BOOK RECOMMENDATION STYLE |
| **Safety rules** | Add or remove restrictions in SAFETY & CONTENT RULES |
| **Response length** | Tune RESPONSE LENGTH thresholds |

You can also change the model by editing:

```python
GRANITE_MODEL_ID = "ibm/granite-3-3-8b-instruct"
```

Available IBM Granite models include:
- `ibm/granite-3-3-8b-instruct`
- `ibm/granite-3-3-2b-instruct`
- `ibm/granite-3-2-8b-instruct`

And tune generation parameters:

```python
GENERATION_PARAMS = {
    GenParams.MAX_NEW_TOKENS: 1024,
    GenParams.TEMPERATURE: 0.7,   # Higher = more creative
    GenParams.TOP_P: 0.9,
    GenParams.TOP_K: 50,
    GenParams.REPETITION_PENALTY: 1.1,
}
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | GET | Serve the main SPA |
| `POST /api/chat` | POST | Chat with the AI assistant |
| `POST /api/recommend` | POST | Get personalized book recommendations |
| `POST /api/reading-plan` | POST | Generate a structured reading plan |
| `GET /api/search?q=query` | GET | AI-powered book search |
| `GET /api/featured-books` | GET | Return curated books list |
| `GET /api/learning-resources` | GET | Return curated resources list |
| `GET /api/health` | GET | Health check + AI connection status |

### Example: Chat request

```json
POST /api/chat
{
  "message": "Recommend Python books for beginners",
  "history": []
}
```

### Example: Reading plan request

```json
POST /api/reading-plan
{
  "goal": "Learn machine learning from scratch",
  "level": "beginner",
  "duration": "4 weeks"
}
```

---

## 🐳 Docker Deployment

### 1. Create a `Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
```

### 2. Build and run

```bash
docker build -t alexandria .
docker run -p 5000:5000 --env-file .env alexandria
```

---

## ☁️ Cloud Deployment

### Deploy to IBM Code Engine

```bash
# Install IBM Cloud CLI and Code Engine plugin
ibmcloud login
ibmcloud ce project create --name alexandria-project
ibmcloud ce app create \
  --name alexandria \
  --image icr.io/<namespace>/alexandria:latest \
  --env-from-secret alexandria-secrets \
  --port 5000
```

### Deploy to Railway / Render / Fly.io

1. Push your code to a GitHub repository
2. Connect your repo to Railway / Render / Fly.io
3. Set the environment variables in the platform's dashboard
4. The app will auto-deploy using `gunicorn app:app`

### Procfile (for Heroku / Railway)

```
web: gunicorn --bind 0.0.0.0:$PORT app:app
```

---

## 🛡️ Security Notes

- **Never commit `.env`** to version control — add it to `.gitignore`
- Use a strong random `FLASK_SECRET_KEY` in production
- Set `FLASK_DEBUG=False` in production
- Consider adding rate limiting for public deployments (`flask-limiter`)

---

## 🔧 Troubleshooting

| Problem | Solution |
|---|---|
| "AI features unavailable" | Check IBM credentials in `.env`; ensure `IBM_CLOUD_API_KEY` and `WATSONX_PROJECT_ID` are set correctly |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` inside the virtual environment |
| `401 Unauthorized` from Watsonx | API key may be expired; regenerate from IBM Cloud IAM |
| Model not found | Verify `GRANITE_MODEL_ID` is supported in your Watsonx region |
| Port already in use | Change `FLASK_PORT=5001` in `.env` |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, Flask 3.0, Flask-CORS |
| AI | IBM Watsonx.ai, IBM Granite 3.3 8B Instruct |
| Frontend | Bootstrap 5.3, Bootstrap Icons, Vanilla JS |
| Fonts | Inter, Playfair Display (Google Fonts) |
| Storage | Browser `localStorage` for history & favorites |
| Production | Gunicorn WSGI server |

---

## 📄 License

MIT License — free to use, modify, and deploy.

---

*Built with ❤️ using IBM Watsonx.ai and IBM Granite*
