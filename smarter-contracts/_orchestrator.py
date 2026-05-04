import time, json, logging
from hashlib import sha256
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from threading import Thread
import uvicorn
import random

CONTRACTS = {}
RANDPAY_WINS = []
NESS_TXS = []
SCRIPT_STATUS = []
COIN_HOURS = []
LOGS = []

UHE_SEED = b"ultra-high-entropy-seed"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrator")

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    LOGS.append(entry)
    print(entry)

def deterministic_ticket_id(seed: bytes, ticket_seq: int, contract_id: str) -> str:
    return sha256(seed + ticket_seq.to_bytes(8, 'big') + contract_id.encode()).hexdigest()

def orchestrator_loop():
    while True:
        try:
            for cid, contract in CONTRACTS.items():
                if random.random() < contract.get("randpay_prob", 1e-6):
                    ticket_seq = int(time.time()*1000) % 1_000_000
                    ticket_hash = deterministic_ticket_id(UHE_SEED, ticket_seq, cid)
                    win = {"contract_id": cid, "ticket_seq": ticket_seq, "ticket_hash": ticket_hash,
                           "amount": random.randint(1, contract.get("max_ticket_value", 100)),
                           "prob": contract.get("randpay_prob", 1e-6)}
                    RANDPAY_WINS.append(win)
                    log(f"Randpay win detected: {win}")

                    ness_tx = {"contract_id": cid, "to": contract['parties']['payee'], "amount": win['amount'],
                               "ticket_hash": ticket_hash, "signature": True, "txid": f"tx{ticket_seq}"}
                    NESS_TXS.append(ness_tx)
                    log(f"Prepared NESS tx: {ness_tx}")

                    script_stat = {"contract_id": cid, "script_cid": contract.get("script_cid", ""), "status":"success"}
                    SCRIPT_STATUS.append(script_stat)
                    log(f"Script executed: {script_stat}")

                    coin_hour = next((ch for ch in COIN_HOURS if ch['contract_id']==cid), None)
                    if not coin_hour:
                        COIN_HOURS.append({"contract_id": cid, "used": ness_tx['amount']})
                    else:
                        coin_hour['used'] += ness_tx['amount']

        except Exception as e:
            log(f"[ERROR] {e}")
        time.sleep(3)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/contracts")
def get_contracts(): return list(CONTRACTS.values())

@app.get("/api/randpay_wins")
def get_randpay_wins(): return RANDPAY_WINS[-50:]

@app.get("/api/ness_txs")
def get_ness_txs(): return NESS_TXS[-50:]

@app.get("/api/script_status")
def get_script_status(): return SCRIPT_STATUS[-50:]

@app.get("/api/coinhours")
def get_coinhours(): return COIN_HOURS

@app.get("/api/logs")
def get_logs(): return "\n".join(LOGS[-200:])

@app.post("/api/broadcast_ness/{txid}")
def broadcast_tx(txid: str):
    log(f"Broadcast request for NESS tx: {txid}")
    return {"status":"broadcast_requested","txid":txid}

def load_example_contracts():
    CONTRACTS["sc1"] = {"contract_id":"sc1","template_cid":"QmExample1","status":"active",
                        "coin_hour_limit":500,"randpay_prob":0.000001,"max_ticket_value":100,
                        "parties":{"payer":"payer1","payee":"payee1"},"script_cid":"QmScript1"}
    CONTRACTS["sc2"] = {"contract_id":"sc2","template_cid":"QmExample2","status":"paused",
                        "coin_hour_limit":300,"randpay_prob":0.0000005,"max_ticket_value":50,
                        "parties":{"payer":"payer2","payee":"payee2"},"script_cid":"QmScript2"}

if __name__=="__main__":
    load_example_contracts()
    Thread(target=orchestrator_loop, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
