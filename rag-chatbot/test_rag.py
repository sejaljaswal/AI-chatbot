import time
from app import setup_rag
from langchain_core.exceptions import OutputParserException
import os

print("Starting tests...")
start = time.time()
try:
    qa_chain = setup_rag()
    print("Startup and Ingestion: OK", round(time.time()-start, 2), "seconds")
except Exception as e:
    print("Startup Error:", e)
    exit(1)

def run_test(query, name):
    print(f"\n--- Testing: {name} ---")
    start = time.time()
    try:
        result = qa_chain.invoke({"query": query})
        print(f"Time: {round(time.time()-start, 2)}s")
        print("Answer:", result["result"])
        print("Source docs retrieved:", len(result["source_documents"]))
    except Exception as e:
        print("Error during execution:", e)

run_test("What are the dates for the Japan trip?", "Standard Retrieval")
run_test("What is the recipe for chocolate cake?", "Out of Context")
run_test("", "Empty Input")
run_test("A "*1000, "Very Long Query")

