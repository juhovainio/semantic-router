#!/usr/bin/env python3
"""
Load test script — sends a mix of simple and complex queries to the router
to populate Insights data across both model tiers.

Usage:
    python3 load_test.py                 # 2 workers, run until Ctrl-C
    python3 load_test.py --workers 4     # 4 concurrent workers
    python3 load_test.py --count 50      # stop after 50 total requests
    python3 load_test.py --delay 0.5     # 0.5s pause between requests per worker
"""

import argparse
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

ENDPOINT = "http://localhost:8899/v1/chat/completions"
MODEL = "MoM"

SIMPLE_QUERIES = [
    "What is 2 + 2?",
    "What is the capital of France?",
    "Define photosynthesis in one sentence.",
    "What color is the sky on a clear day?",
    "How many days are in a week?",
    "What year did World War II end?",
    "What is the boiling point of water in Celsius?",
    "Who wrote Romeo and Juliet?",
    "What is the largest planet in the solar system?",
    "What does HTTP stand for?",
    "Translate 'hello' to Spanish.",
    "What is the square root of 144?",
    "What is the speed of light?",
    "Name three primary colors.",
    "What language is spoken in Brazil?",
    "How many continents are there?",
    "What is the chemical symbol for gold?",
    "Who painted the Mona Lisa?",
]

COMPLEX_QUERIES = [
    "Design a distributed microservices architecture for a real-time payments platform handling 100k TPS.",
    "Analyze the long-term geopolitical implications of quantum computing on global cybersecurity norms.",
    "Explain the mathematical derivation of the backpropagation algorithm in neural networks, including the chain rule applied to each layer.",
    "Compare and contrast RLHF, DPO, and PPO as LLM alignment techniques, including their theoretical limitations and empirical failure modes.",
    "Write a Rust implementation of a lock-free concurrent hash map with epoch-based memory reclamation.",
    "How does transformer attention scale with sequence length and what architectural alternatives exist to address this?",
    "Analyze the tradeoffs between consistency, availability, and partition tolerance in a globally distributed database with mixed read/write workloads.",
    "Propose a novel research direction combining causal inference with large language model reasoning.",
    "Explain how NUMA topology affects memory access patterns in multi-socket server deployments and how to optimize for it.",
    "Draft a comprehensive regulatory compliance checklist for a fintech startup operating across the EU and US markets.",
    "Synthesize the key arguments in the current debate about AI consciousness and moral patiency, citing relevant philosophical positions.",
    "What are the ethical trade-offs in using predictive policing algorithms in diverse urban environments, considering both consequentialist and deontological frameworks?",
    "Derive the Euler-Lagrange equations from Hamilton's principle and explain their role in classical mechanics.",
    "Explain the Rust borrow checker's ownership model and how it prevents data races at compile time.",
]


@dataclass
class Result:
    query: str
    status: int
    elapsed_ms: float
    error: str = ""


_lock = threading.Lock()
_counts = {"ok": 0, "err": 0}


def send_request(query: str) -> Result:
    payload = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": query}],
        "max_tokens": 256,
    }).encode()

    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
            elapsed = (time.monotonic() - t0) * 1000
            model = body.get("model", "?")
            tokens = body.get("usage", {}).get("total_tokens", "?")
            return Result(query=query, status=resp.status, elapsed_ms=elapsed), model, tokens
    except urllib.error.HTTPError as e:
        elapsed = (time.monotonic() - t0) * 1000
        body = e.read().decode(errors="replace")[:120]
        return Result(query=query, status=e.code, elapsed_ms=elapsed, error=body), "?", "?"
    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        return Result(query=query, status=0, elapsed_ms=elapsed, error=str(e)), "?", "?"


def worker(worker_id: int, count_limit: int | None, delay: float, stop_event: threading.Event):
    local_count = 0
    # Weight toward simple queries (2:1) so routing distribution is visible
    pool = SIMPLE_QUERIES * 2 + COMPLEX_QUERIES

    while not stop_event.is_set():
        if count_limit is not None:
            with _lock:
                total = _counts["ok"] + _counts["err"]
                if total >= count_limit:
                    break

        query = random.choice(pool)
        result, model, tokens = send_request(query)
        local_count += 1

        with _lock:
            if result.status == 200:
                _counts["ok"] += 1
                total = _counts["ok"] + _counts["err"]
                short_q = query[:55] + "…" if len(query) > 55 else query
                short_m = model.split("/")[-1] if "/" in model else model
                print(f"[w{worker_id}] #{total:4d} ✓ {result.elapsed_ms:6.0f}ms  {short_m:<28s}  {str(tokens):>6} tok  \"{short_q}\"")
            else:
                _counts["err"] += 1
                total = _counts["ok"] + _counts["err"]
                print(f"[w{worker_id}] #{total:4d} ✗ {result.status}  {result.elapsed_ms:6.0f}ms  err: {result.error[:80]}")

        if delay > 0:
            stop_event.wait(delay)


def main():
    parser = argparse.ArgumentParser(description="vllm-sr load test")
    parser.add_argument("--workers", type=int, default=2, help="concurrent workers (default: 2)")
    parser.add_argument("--count", type=int, default=None, help="stop after N total requests")
    parser.add_argument("--delay", type=float, default=0.2, help="seconds between requests per worker (default: 0.2)")
    args = parser.parse_args()

    print(f"Sending requests to {ENDPOINT}")
    print(f"Workers: {args.workers}  |  Delay: {args.delay}s  |  Limit: {args.count or 'unlimited'}")
    print(f"Query pool: {len(SIMPLE_QUERIES)} simple + {len(COMPLEX_QUERIES)} complex")
    print("Press Ctrl-C to stop.\n")

    stop_event = threading.Event()
    threads = []
    for i in range(args.workers):
        t = threading.Thread(target=worker, args=(i + 1, args.count, args.delay, stop_event), daemon=True)
        t.start()
        threads.append(t)

    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping…")
        stop_event.set()

    for t in threads:
        t.join(timeout=5)

    print(f"\nDone — {_counts['ok']} ok, {_counts['err']} errors")


if __name__ == "__main__":
    main()
