# NeuralChat — Premium AI Assistant

NeuralChat is a modern, responsive AI chatbot application featuring a high-performance Python backend and a stunning, glassmorphism-inspired web interface. It leverages advanced language models via RapidAPI to provide intelligent responses in real-time.

## ✨ Key Features

- **Premium Web UI**: Dark-themed, glassmorphic design with smooth animations and transitions.
- **Collapsible Sidebar**: Interactive sidebar that can be collapsed into a compact view by clicking the "NeuralChat" logo.
- **Session-Based History**: Grouped chat history that organizes conversations into single session blocks.
- **Persistence**: Remembers your sidebar preference (open/closed) and theme settings across sessions.
- **Dual Interface**: Supports both a modern Web interface and a classic Terminal interface.

## 🚀 Installation & Setup

### 1. Prerequisites
Ensure you have Python 3.8+ installed on your system.

### 2. Setup Virtual Environment
```powershell
python -m venv .venv
.\.venv\Scripts\activate
```

### 3. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 4. Configure API Key
Open `main.py` and replace the `X-RapidAPI-Key` in the `headers` dictionary with your own key from [RapidAPI](https://rapidapi.com/LightningDev/api/simple-chatgpt-api).

## 🛠️ How to Run

### Web Interface (Recommended)
This launches the Flask backend and serves the frontend at `http://localhost:5000`.
```powershell
python api.py
```

### Terminal Interface
For a direct console-based interaction:
```powershell
python main.py
```

## 📸 Interface Preview
![NeuralChat Interface](https://i.postimg.cc/X7cFsqBr/image.png)

---
*NeuralChat — Powered by Advanced AI*