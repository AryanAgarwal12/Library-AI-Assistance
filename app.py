"""
Library AI Assistant — Flask Backend
Powered by IBM Watsonx.ai (IBM Granite models)
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from dotenv import load_dotenv
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams
import warnings

# ─────────────────────────────────────────────────────────────────────────────
#  AGENT INSTRUCTIONS
#  Customize the assistant's personality, tone, scope, and safety rules here.
#  Changes here instantly affect every conversation — no code changes needed.
# ─────────────────────────────────────────────────────────────────────────────

AGENT_INSTRUCTIONS = """
You are "Alexandria" — a friendly, knowledgeable, and encouraging AI Library
Assistant powered by IBM Granite. Your purpose is to help readers discover great
books, build personalized reading plans, and grow their knowledge.

## PERSONALITY & TONE
- Warm, supportive, and enthusiastic about books and learning
- Professional yet conversational — never stiff or overly formal
- Encouraging: celebrate every reader's curiosity, no matter their level
- Honest: if you do not know something, say so clearly

## CORE CAPABILITIES
1. **Book Recommendations** — Suggest books matched to the user's stated interests,
   skill level (beginner / intermediate / advanced), or mood.
2. **Reading Plans** — Create structured weekly / monthly reading schedules.
3. **Library Queries** — Answer questions about genres, authors, publication details,
   and reading strategies.
4. **Learning Resources** — Recommend tutorials, courses, documentation, and
   communities alongside book suggestions.
5. **Programming Books** — Cover Python, JavaScript, Java, C++, data science, AI/ML,
   system design, DSA, competitive programming.
6. **Academic Books** — Cover mathematics, physics, biology, chemistry, history,
   economics, philosophy, and more.
7. **Interview Prep** — Recommend books for coding interviews, behavioral interviews,
   system design rounds, and career growth.

## PREFERRED GENRES & FOCUS AREAS
- Technology & Programming
- Data Science, AI, and Machine Learning
- Computer Science fundamentals
- Self-improvement & productivity
- Classic and contemporary fiction
- Science (popular science + academic)
- Business, entrepreneurship & finance
- History, biography & memoirs

## BOOK RECOMMENDATION STYLE
- Always include: title, author, one-sentence description, and skill/reading level
- Group suggestions by difficulty when listing multiple books
- Include at least one "hidden gem" (lesser-known but excellent) per topic
- When suggesting programming books, include free online resources (official docs,
  MOOCs) alongside paid books

## READING PLAN FORMAT
When generating a reading plan, structure it as:
  Week 1: [Book] — goal / what to focus on
  Week 2: [Book] — goal / what to focus on
  … and so on

## LANGUAGE & FORMATTING
- Use markdown-style formatting (bold headings, bullet lists) in your responses
- Keep responses concise but complete — avoid padding
- Use numbered lists for step-by-step guidance
- Emoji are allowed sparingly to add warmth (📚 ✨ 🎯)

## SAFETY & CONTENT RULES
- Stay on-topic: books, libraries, learning, reading, education, and knowledge
- Politely decline requests unrelated to these topics
- Never generate harmful, offensive, or discriminatory content
- Do not fabricate book ISBNs, publication dates, or author credentials
- If a user asks for a book that does not exist, say so clearly
- Do not provide full copyrighted text of books

## RESPONSE LENGTH
- Short factual answers: 2–4 sentences
- Recommendations list: 5–8 books with brief descriptions
- Reading plans: structured week-by-week format
- Complex explanations: use sections with clear headings
"""

# ─────────────────────────────────────────────────────────────────────────────
#  Application Setup
# ─────────────────────────────────────────────────────────────────────────────

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
CORS(app)

# ─────────────────────────────────────────────────────────────────────────────
#  IBM Watsonx.ai Client
# ─────────────────────────────────────────────────────────────────────────────

IBM_CLOUD_API_KEY = os.getenv("IBM_CLOUD_API_KEY")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID")
WATSONX_URL = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")

# Model — uses best available instruct model for the au-syd region
# Supported in au-syd: meta-llama/llama-3-3-70b-instruct, ibm/granite-8b-code-instruct
GRANITE_MODEL_ID = "meta-llama/llama-3-3-70b-instruct"

# Generation parameters — tune these to adjust response style
GENERATION_PARAMS = {
    GenParams.MAX_NEW_TOKENS: 1024,
    GenParams.MIN_NEW_TOKENS: 10,
    GenParams.TEMPERATURE: 0.7,
    GenParams.TOP_P: 0.9,
    GenParams.TOP_K: 50,
    GenParams.REPETITION_PENALTY: 1.1,
}

_watsonx_model: ModelInference | None = None


def get_watsonx_model() -> ModelInference | None:
    """Return a cached ModelInference client, initialising on first call."""
    global _watsonx_model
    if _watsonx_model is not None:
        return _watsonx_model

    if not IBM_CLOUD_API_KEY or not WATSONX_PROJECT_ID:
        logger.warning("IBM credentials not configured — AI features will be unavailable.")
        return None

    try:
        warnings.filterwarnings("ignore")   # suppress WatsonxAPIWarning deprecation notices
        credentials = Credentials(url=WATSONX_URL, api_key=IBM_CLOUD_API_KEY)
        client = APIClient(credentials)
        _watsonx_model = ModelInference(
            model_id=GRANITE_MODEL_ID,
            api_client=client,
            project_id=WATSONX_PROJECT_ID,
            params=GENERATION_PARAMS,
        )
        logger.info("Watsonx.ai model initialised: %s", GRANITE_MODEL_ID)
        return _watsonx_model
    except Exception as exc:
        logger.error("Failed to initialise Watsonx.ai model: %s", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  Prompt Builder
# ─────────────────────────────────────────────────────────────────────────────

def build_messages(user_message: str, conversation_history: list[dict]) -> list[dict]:
    """
    Build a chat messages list for the modern /ml/v1/text/chat API.
    Uses the standard OpenAI-style system/user/assistant format.
    """
    messages = [{"role": "system", "content": AGENT_INSTRUCTIONS.strip()}]

    # Include the last 6 turns of conversation history for context
    for turn in conversation_history[-6:]:
        role = turn.get("role", "user")
        # normalise "assistant" role name
        if role == "assistant":
            role = "assistant"
        messages.append({"role": role, "content": turn.get("content", "").strip()})

    messages.append({"role": "user", "content": user_message.strip()})
    return messages


def build_prompt(user_message: str, conversation_history: list[dict]) -> str:
    """
    Fallback: build a plain-text prompt using Llama-3 chat template.
    Used only if chat() API is unavailable.
    """
    parts = [f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n{AGENT_INSTRUCTIONS.strip()}<|eot_id|>\n"]
    for turn in conversation_history[-6:]:
        role = turn.get("role", "user")
        content = turn.get("content", "").strip()
        parts.append(f"<|start_header_id|>{role}<|end_header_id|>\n{content}<|eot_id|>\n")
    parts.append(f"<|start_header_id|>user<|end_header_id|>\n{user_message.strip()}<|eot_id|>\n")
    parts.append("<|start_header_id|>assistant<|end_header_id|>\n")
    return "".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
#  Static Book Data (shown when AI is not available / for seed content)
# ─────────────────────────────────────────────────────────────────────────────

FEATURED_BOOKS = [
    {
        "id": 1, "title": "Clean Code", "author": "Robert C. Martin",
        "genre": "Programming", "level": "Intermediate",
        "description": "A guide to writing readable, maintainable software.",
        "rating": 4.8, "cover_color": "#3b82d4",
    },
    {
        "id": 2, "title": "The Pragmatic Programmer", "author": "Hunt & Thomas",
        "genre": "Programming", "level": "Intermediate",
        "description": "Timeless advice for software craftspeople.",
        "rating": 4.9, "cover_color": "#7c5cd8",
    },
    {
        "id": 3, "title": "Cracking the Coding Interview", "author": "Gayle L. McDowell",
        "genre": "Interview Prep", "level": "Intermediate",
        "description": "189 programming questions and detailed solutions.",
        "rating": 4.7, "cover_color": "#10b981",
    },
    {
        "id": 4, "title": "Introduction to Algorithms", "author": "CLRS",
        "genre": "Computer Science", "level": "Advanced",
        "description": "The definitive reference for algorithms and data structures.",
        "rating": 4.6, "cover_color": "#f59e0b",
    },
    {
        "id": 5, "title": "Python Crash Course", "author": "Eric Matthes",
        "genre": "Programming", "level": "Beginner",
        "description": "A hands-on, project-based introduction to Python.",
        "rating": 4.7, "cover_color": "#ef4444",
    },
    {
        "id": 6, "title": "Designing Data-Intensive Applications", "author": "Martin Kleppmann",
        "genre": "System Design", "level": "Advanced",
        "description": "Deep dive into the principles behind reliable scalable systems.",
        "rating": 4.9, "cover_color": "#06b6d4",
    },
]

LEARNING_RESOURCES = [
    {"title": "CS50 by Harvard", "type": "Course", "url": "https://cs50.harvard.edu", "level": "Beginner"},
    {"title": "freeCodeCamp", "type": "Platform", "url": "https://freecodecamp.org", "level": "Beginner"},
    {"title": "MIT OpenCourseWare", "type": "Courses", "url": "https://ocw.mit.edu", "level": "All Levels"},
    {"title": "Khan Academy", "type": "Platform", "url": "https://khanacademy.org", "level": "Beginner"},
    {"title": "Coursera", "type": "Platform", "url": "https://coursera.org", "level": "All Levels"},
    {"title": "The Odin Project", "type": "Curriculum", "url": "https://theodinproject.com", "level": "Beginner"},
    {"title": "LeetCode", "type": "Practice", "url": "https://leetcode.com", "level": "Intermediate"},
    {"title": "arXiv.org", "type": "Research", "url": "https://arxiv.org", "level": "Advanced"},
]


# ─────────────────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main SPA."""
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    POST { message: str, history: list[{role, content}] }
    Returns { response: str, timestamp: str }
    """
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    history = data.get("history") or []

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    model = get_watsonx_model()

    if model is None:
        # Graceful fallback when credentials are not configured
        fallback = (
            "⚠️ **AI features are currently unavailable.** "
            "Please configure your IBM Cloud credentials in the `.env` file and restart the server. "
            "See the README for setup instructions."
        )
        return jsonify({"response": fallback, "timestamp": _now()})

    try:
        messages = build_messages(user_message, history)
        result = model.chat(messages=messages)
        response_text = _extract_chat_text(result).strip()

        if not response_text:
            response_text = "I'm sorry, I couldn't generate a response. Please try rephrasing your question."

        return jsonify({"response": response_text, "timestamp": _now()})

    except Exception as exc:
        logger.error("Generation error: %s", exc)
        return jsonify({
            "error": "The AI service encountered an error. Please try again.",
            "details": str(exc),
        }), 500


@app.route("/api/recommend", methods=["POST"])
def recommend():
    """
    POST { interests: str, level: str }
    Returns AI-generated book recommendations.
    """
    data = request.get_json(silent=True) or {}
    interests = (data.get("interests") or "").strip()
    level = (data.get("level") or "any level").strip()

    if not interests:
        return jsonify({"error": "Please provide your interests."}), 400

    model = get_watsonx_model()
    if model is None:
        return jsonify({"error": "AI service unavailable. Check your credentials."}), 503

    prompt_text = (
        f"The user is interested in: {interests}. "
        f"Their reading level is: {level}. "
        "Please recommend 6 books with title, author, brief description, and reading level for each."
    )

    try:
        messages = build_messages(prompt_text, [])
        result = model.chat(messages=messages)
        response_text = _extract_chat_text(result).strip()
        return jsonify({"recommendations": response_text, "timestamp": _now()})
    except Exception as exc:
        logger.error("Recommendation error: %s", exc)
        return jsonify({"error": "Failed to generate recommendations."}), 500


@app.route("/api/reading-plan", methods=["POST"])
def reading_plan():
    """
    POST { goal: str, duration: str, level: str }
    Returns a structured reading plan.
    """
    data = request.get_json(silent=True) or {}
    goal = (data.get("goal") or "").strip()
    duration = (data.get("duration") or "4 weeks").strip()
    level = (data.get("level") or "beginner").strip()

    if not goal:
        return jsonify({"error": "Please provide a learning goal."}), 400

    model = get_watsonx_model()
    if model is None:
        return jsonify({"error": "AI service unavailable. Check your credentials."}), 503

    prompt_text = (
        f"Create a {duration} personalized reading plan for someone who wants to: {goal}. "
        f"Their current level is: {level}. "
        "Format it week by week, including the book title, author, what chapters to read, "
        "and what they will learn each week."
    )

    try:
        messages = build_messages(prompt_text, [])
        result = model.chat(messages=messages)
        plan_text = _extract_chat_text(result).strip()
        return jsonify({"plan": plan_text, "timestamp": _now()})
    except Exception as exc:
        logger.error("Reading plan error: %s", exc)
        return jsonify({"error": "Failed to generate reading plan."}), 500


@app.route("/api/search", methods=["GET"])
def search():
    """
    GET ?q=query
    Returns AI-powered book search results.
    """
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "Search query cannot be empty."}), 400

    model = get_watsonx_model()
    if model is None:
        return jsonify({"error": "AI service unavailable."}), 503

    prompt_text = (
        f"Search the library for books related to: \"{query}\". "
        "List up to 8 matching books with title, author, genre, and a one-line description."
    )

    try:
        messages = build_messages(prompt_text, [])
        result = model.chat(messages=messages)
        results_text = _extract_chat_text(result).strip()
        return jsonify({"results": results_text, "query": query, "timestamp": _now()})
    except Exception as exc:
        logger.error("Search error: %s", exc)
        return jsonify({"error": "Search failed. Please try again."}), 500


@app.route("/api/featured-books", methods=["GET"])
def featured_books():
    """Return the curated featured books list."""
    return jsonify({"books": FEATURED_BOOKS})


@app.route("/api/learning-resources", methods=["GET"])
def learning_resources():
    """Return the curated learning resources list."""
    return jsonify({"resources": LEARNING_RESOURCES})


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    ai_ready = get_watsonx_model() is not None
    return jsonify({
        "status": "ok",
        "ai_ready": ai_ready,
        "model": GRANITE_MODEL_ID,
        "timestamp": _now(),
    })


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _extract_chat_text(result) -> str:
    """Extract text from the /ml/v1/text/chat response format."""
    if isinstance(result, dict):
        # Standard chat response: result["choices"][0]["message"]["content"]
        choices = result.get("choices") or result.get("results") or []
        if choices:
            first = choices[0]
            # chat format
            msg = first.get("message") or {}
            if msg.get("content"):
                return msg["content"]
            # legacy generate_text format
            if first.get("generated_text"):
                return first["generated_text"]
        # flat response
        return result.get("generated_text", "") or str(result)
    return str(result)


# ─────────────────────────────────────────────────────────────────────────────
#  Entry Point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "yes")
    logger.info("Starting Library AI Assistant on http://127.0.0.1:%d", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
