import requests
import pyfiglet
import itertools
import threading
import time
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

url = "https://open-ai21.p.rapidapi.com/conversationllama"


headers = {
    "content-type": "application/json",
    "X-RapidAPI-Key": os.getenv("RAPID_API_KEY"),
    "X-RapidAPI-Host": os.getenv("RAPID_API_HOST")
}


def animate():
    for c in itertools.cycle(['|', '/', '-', '\\']):
        if done:
            break
        sys.stdout.write('\r' + c)
        sys.stdout.flush()
        time.sleep(0.05)  # Faster animation

    # Clear the console output
    sys.stdout.write('\r')
    sys.stdout.flush()


def ask(question, conversation_history):
    # Add current question to history
    conversation_history.append({"role": "user", "content": question})
    
    payload = {
        "messages": conversation_history
    }
    response = requests.post(url, json=payload, headers=headers, timeout=30)
    try:
        data = response.json()
        answer = None
        if isinstance(data, dict):
            # Extract answer from response
            if "result" in data:
                answer = data["result"]
            elif "choices" in data and len(data["choices"]) > 0:
                if "message" in data["choices"][0]:
                    answer = data["choices"][0]["message"].get("content", str(data))
                else:
                    answer = str(data["choices"][0])
            else:
                answer = str(data)
        else:
            answer = str(data)
        
        # Add AI response to history
        if answer:
            conversation_history.append({"role": "assistant", "content": answer})
        
        return answer
    except Exception as e:
        return f"Error: {response.text}"


if __name__ == "__main__":
    print(pyfiglet.figlet_format("AI Chat BOT"))
    print("Enter the question to ask:")
    print()
    conversation_history = []  # Store conversation history
    while True:
        question = str(input(">>  "))
        if (question == 'q'):
            print(">>  Bye! Thanks for Using...")
            break
        # loading
        done = False
        # here is the animation
        t = threading.Thread(target=animate)
        t.start()
        answer = ask(question, conversation_history)  # Pass history
        done = True
        t.join()
        print(">> ", answer)
        print()