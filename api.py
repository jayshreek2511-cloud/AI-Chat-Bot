from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import uuid
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

    try:
        # Pass the session's specific message history to the AI
        reply = ask(user_message, session["messages"])
        
        # Save to disk
        save_history(chat_history)
        
        return jsonify({
            "reply": reply,
            "sessionId": session["id"],
            "title": session["title"]
        })
    except Exception as e:
        return jsonify({"error": f"Backend error: {str(e)}"}), 500

if __name__ == "__main__":
    print("=" * 50)
    print("  NeuralChat Persistent Server")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
