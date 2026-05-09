from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import uuid
import traceback
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import your existing chatbot logic
from main import ask

app = Flask(__name__, static_folder="frontend", static_url_path="")
CORS(app)

HISTORY_FILE = "conversations.json"

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except:
            return {"sessions": []}
    return {"sessions": []}

def save_history(data):
    with open(HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=4)

# Load existing history on startup
chat_history = load_history()

@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.route("/sessions", methods=["GET"])
def get_sessions():
    """Returns a list of all chat sessions (titles and IDs)."""
    return jsonify([{"id": s["id"], "title": s["title"]} for s in chat_history["sessions"]])

@app.route("/session/<session_id>", methods=["GET"])
def get_session(session_id):
    """Returns all messages for a specific session."""
    session = next((s for s in chat_history["sessions"] if s["id"] == session_id), None)
    if session:
        return jsonify(session)
    return jsonify({"error": "Session not found"}), 404

@app.route("/chat", methods=["POST"])
def chat():
    global chat_history

    # GEMINI FIX START
    try:
        data = request.get_json(force=True)
        user_message = data.get("message", "").strip()
        session_id = data.get("sessionId")

        if not user_message:
            return jsonify({"error": "Message cannot be empty"}), 400

        # Handle New Chat Reset
        if user_message == "__new_chat__":
            return jsonify({"reply": "Ready for a new chat!"})

        # Find or create session
        session = next((s for s in chat_history["sessions"] if s["id"] == session_id), None)
        if not session:
            session = {
                "id": str(uuid.uuid4()),
                "title": user_message[:30] + "..." if len(user_message) > 30 else user_message,
                "messages": []
            }
            chat_history["sessions"].insert(0, session)

        # Save user message to session
        session["messages"].append({"role": "user", "content": user_message})

        # Build conversation context from session history
        history_prompt = ""
        for msg in session["messages"][-10:]:
            role = msg["role"].capitalize()
            history_prompt += f"{role}: {msg['content']}\n"
        history_prompt += "Assistant:"

        reply = gemini_ask(history_prompt)
        session["messages"].append({"role": "assistant", "content": reply})

        # Save to disk
        save_history(chat_history)

        return jsonify({
            "reply": reply,
            "sessionId": session["id"],
            "title": session["title"]
        })
    except Exception as e:
        traceback.print_exc()
        print(f"  /chat route error: {str(e)}")
        return jsonify({"error": f"Backend error: {str(e)}"}), 500
    # GEMINI FIX END

# ============================================================
# RAG PART 1 START — File Upload Backend
# ============================================================
import pdfplumber

# ============================================================
# RAG PART 2 START — ChromaDB Vector Embedding & Storage
# ============================================================
# WHAT IS AN EMBEDDING?
# An embedding converts text into a list of numbers (a vector) that captures its meaning.
# We need embeddings so ChromaDB can find the most relevant chunks when the user asks a question.
import chromadb

CHROMA_STORE = "chroma_store"
chroma_client = chromadb.PersistentClient(path=CHROMA_STORE)
# ============================================================
# RAG PART 2 END (init section)
# ============================================================

# ============================================================
# RAG PART 5 START — SQLite Persistent Chat History
# ============================================================
# sqlite3 is built into Python — no pip install needed
import sqlite3
from datetime import datetime

RAG_DB = "rag_chat_history.db"


def init_rag_db():
    """Create the SQLite database and chat_history table on startup."""
    conn = sqlite3.connect(RAG_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT,
            role        TEXT,
            message     TEXT,
            timestamp   TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("  RAG chat history database ready")


def save_rag_message(session_id, role, message):
    """Save a single message to the RAG chat history."""
    conn = sqlite3.connect(RAG_DB)
    conn.execute(
        "INSERT INTO chat_history (session_id, role, message, timestamp) VALUES (?, ?, ?, ?)",
        (session_id, role, message, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def get_rag_history(session_id, limit=6):
    """Load the last N messages for a session from SQLite."""
    conn = sqlite3.connect(RAG_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT role, message, timestamp FROM chat_history WHERE session_id = ? ORDER BY id DESC LIMIT ?",
        (session_id, limit)
    ).fetchall()
    conn.close()
    rows.reverse()  # Oldest first for prompt injection
    messages = [{"role": r["role"], "message": r["message"], "timestamp": r["timestamp"]} for r in rows]
    print(f"  Loaded {len(messages)} previous messages for session: {session_id}")
    return messages


init_rag_db()
# ============================================================
# RAG PART 5 END (init section)
# ============================================================

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def chunk_text(text, chunk_size=500, overlap=50):
    """Split text into word-based chunks with overlap."""
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "api.py is running fine"})


@app.route("/upload", methods=["POST"])
def upload_file():
    # Check if a file was sent
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    filename = file.filename.lower()

    # --- Extract text based on file type ---
    if filename.endswith(".pdf"):
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)
        extracted_text = ""
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n"

    elif filename.endswith(".txt"):
        extracted_text = file.read().decode("utf-8")

    else:
        return jsonify({"error": "Only PDF and TXT files are supported"}), 400

    if not extracted_text.strip():
        return jsonify({"error": "No text could be extracted from the file"}), 400

    # --- Chunk the text ---
    chunks = chunk_text(extracted_text)

    # --- Print to terminal for verification ---
    print("\n" + "=" * 50)
    print(f"  FILE UPLOADED: {file.filename}")
    print("=" * 50)
    for i, chunk in enumerate(chunks):
        print(f"  Chunk {i + 1}: {chunk[:50]}...")
    print(f"\n  TOTAL CHUNKS CREATED: {len(chunks)}")
    print("=" * 50 + "\n")

    # ========================================================
    # RAG PART 2 — Store chunks as vector embeddings in ChromaDB
    # ========================================================

    # Delete old collection if it exists, then create fresh
    try:
        chroma_client.delete_collection(name="neuralchat_docs")
        print("  Old 'neuralchat_docs' collection deleted.")
    except Exception:
        pass  # Collection didn't exist yet, that's fine

    collection = chroma_client.create_collection(name="neuralchat_docs")

    # Prepare IDs, documents and metadata for ChromaDB
    chunk_ids = [f"chunk_{i}" for i in range(len(chunks))]
    chunk_metadatas = [{"source": file.filename, "chunk_index": i} for i in range(len(chunks))]

    # Add all chunks — ChromaDB auto-generates embeddings using its default model
    collection.add(
        ids=chunk_ids,
        documents=chunks,
        metadatas=chunk_metadatas
    )

    # Terminal verification
    print("\n" + "=" * 50)
    print(f"  ✅ Stored {len(chunks)} chunks into ChromaDB successfully")
    print(f"  Sample → ID: {chunk_ids[0]} | Preview: {chunks[0][:60]}...")
    print("=" * 50 + "\n")

    # ========================================================
    # RAG PART 2 END (inside /upload)
    # ========================================================

    return jsonify({
        "status": "success",
        "filename": file.filename,
        "total_chunks": len(chunks),
        "preview": extracted_text[:100],
        "embeddings_stored": True
    })

# ============================================================
# RAG PART 1 END
# ============================================================

# ============================================================
# RAG PART 3 START — RAG Query Pipeline
# ============================================================

# ============================================================
# RAG PART 4 START — Gemini API + Streaming
# ============================================================
from flask import Response, stream_with_context
import google.generativeai as genai

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")

if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    print(f"  Gemini API loaded successfully using {GEMINI_MODEL_NAME}")
else:
    gemini_model = None
    print("  WARNING: No Gemini API key found — will use RapidAPI fallback")


# GEMINI FIX START
def gemini_ask(prompt):
    """Call Gemini API directly. Returns a plain string."""
    if not gemini_model:
        raise Exception("Gemini API key not configured. Add GEMINI_API_KEY to .env")
    try:
        print("  Using Gemini API...")
        response = gemini_model.generate_content(prompt)
        result = response.text
        print(f"  Gemini returned {len(result)} chars")
        return result
    except Exception as e:
        traceback.print_exc()
        print(f"  gemini_ask error: {str(e)}")
        raise
# GEMINI FIX END


def gemini_stream(prompt):
    """Stream Gemini response chunk by chunk. Returns a generator."""
    if not gemini_model:
        yield "Error: Gemini API key not configured."
        return
    print("  Streaming response started...")
    response = gemini_model.generate_content(prompt, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text
    print("  Streaming complete")

# ============================================================
# RAG PART 4 END (helper functions)
# ============================================================


@app.route("/rag-chat", methods=["POST"])
def rag_chat():
    data = request.get_json(force=True)
    question = data.get("question", "").strip()
    use_stream = data.get("stream", False)
    # --- RAG PART 5: Get session_id ---
    session_id = data.get("session_id", "default")

    if not question:
        return jsonify({"error": "Question cannot be empty"}), 400

    # --- Step 1: Check if the collection exists ---
    try:
        collection = chroma_client.get_collection(name="neuralchat_docs")
    except Exception:
        return jsonify({"error": "No document uploaded yet. Please upload a PDF or TXT first via /upload"}), 400

    # --- Step 2: Query ChromaDB for top 3 most similar chunks ---
    results = collection.query(
        query_texts=[question],
        n_results=3
    )

    retrieved_chunks = results["documents"][0]
    retrieved_ids = results["ids"][0]

    # --- Step 3: Build the context-augmented prompt ---
    context_block = ""
    for i, chunk in enumerate(retrieved_chunks):
        context_block += f"Chunk {i + 1}: {chunk}\n\n"

    # --- RAG PART 5: Load history, save user message, build history block ---
    history_messages = get_rag_history(session_id, limit=6)
    save_rag_message(session_id, "user", question)
    print("  Saved user message to RAG history")
    history_block = ""
    if history_messages:
        history_block = "Previous conversation:\n"
        for msg in history_messages:
            history_block += f"{msg['role'].capitalize()}: {msg['message']}\n"
        history_block += "\n"
    # --- RAG PART 5 END (history injection) ---

    rag_prompt = (
        "You are a helpful assistant. Answer the question using ONLY the context below.\n"
        "If the answer is not in the context, say 'I could not find this in the document.'\n\n"
        f"Context:\n{context_block}"
        f"{history_block}"
        f"Question: {question}\n"
        "Answer:"
    )

    # --- Step 4: Terminal logging ---
    print("\n" + "=" * 50)
    print(f"  RAG QUERY: {question}")
    print(f"  Top 3 chunks retrieved: {retrieved_ids}")
    print("=" * 50)

    # --- Step 5: Build source previews ---
    sources = []
    for i, chunk_id in enumerate(retrieved_ids):
        sources.append({
            "chunk_id": chunk_id,
            "preview": retrieved_chunks[i][:80]
        })

    # --- RAG PART 4: Streaming mode ---
    if use_stream:
        def generate():
            full_answer = ""
            for text_chunk in gemini_stream(rag_prompt):
                full_answer += text_chunk
                yield text_chunk
            yield "\n\n[DONE]"
            # Log sources to terminal since they can't be in the stream
            print(f"  Sources: {[s['chunk_id'] for s in sources]}")
            # --- RAG PART 5: Save streamed assistant response ---
            save_rag_message(session_id, "assistant", full_answer)
            print("  Saved assistant response to RAG history")

        return Response(stream_with_context(generate()), content_type="text/plain")

    # --- Non-streaming mode (original behavior, now with Gemini) ---
    try:
        answer = gemini_ask(rag_prompt)
        print("  Answer generated successfully")
        # --- RAG PART 5: Save non-streamed assistant response ---
        save_rag_message(session_id, "assistant", answer)
        print("  Saved assistant response to RAG history")
        print("=" * 50 + "\n")
    except Exception as e:
        return jsonify({"error": f"AI request failed: {str(e)}"}), 500

    return jsonify({
        "answer": answer,
        "sources": sources
    })

# ============================================================
# RAG PART 5 START — History Retrieval Route
# ============================================================

@app.route("/rag-history", methods=["GET"])
def rag_history():
    """Return all RAG chat messages for a given session_id."""
    session_id = request.args.get("session_id", "default")
    conn = sqlite3.connect(RAG_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT role, message, timestamp FROM chat_history WHERE session_id = ? ORDER BY id ASC",
        (session_id,)
    ).fetchall()
    conn.close()
    messages = [{"role": r["role"], "message": r["message"], "timestamp": r["timestamp"]} for r in rows]
    return jsonify({
        "session_id": session_id,
        "messages": messages
    })

# ============================================================
# RAG PART 5 END (history route)
# ============================================================

# ============================================================
# RAG PART 3 END
# ============================================================


if __name__ == "__main__":
    print("=" * 50)
    print("  NeuralChat Persistent Server")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
