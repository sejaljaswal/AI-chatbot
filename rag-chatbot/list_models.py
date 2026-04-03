import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
print("API Key Prefix:", api_key[:10] if api_key else "None")

genai.configure(api_key=api_key)
try:
    models = list(genai.list_models())
    print("Found models:", len(models))
    for m in models:
        print(m.name, m.supported_generation_methods)
except Exception as e:
    print("Error:", e)
