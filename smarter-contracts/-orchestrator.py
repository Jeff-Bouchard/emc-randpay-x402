import requests, time, logging, json, os
from hashlib import sha256
from threading import Thread
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import uvicorn

# ------------------------
# CONFIG
# ------------------------
EMC_RPC_URL = os.getenv("EMC_RPC_URL", "http://127.0.0.1:6662")
EMC_RPC_USER = os.getenv("EMC_RPC_USER", "rpcuser")
EMC_RPC_PASS = os.getenv("EMC_RPC_PASS", "rpcpass")
NESS_RPC_URL = os.getenv("NESS_RPC_URL", "http://127.0.0.1:6660")
#NESS_RPC_USER = os.getenv("NESS_RPC_USER", "nessuser")
#NESS_RPC_PASS = os.getenv("NESS_RPC_PASS", "nesspass")
POLL_INTERVAL = 3
UHE_SEED = b"ultra-high-entropy-seed"

# ------------------------
# LOGGING
# ------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smarter_contracts")
def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

# ------------------------
# STATE
# ------------------------
CONTRACTS, RANDPAY_WINS, NESS_TXS, SCRIPT_STATUS, COIN_HOURS = {}, [], [], [], []

# ------------------------
# RPC HELPERS
# ------------------------
def emc_rpc_call(method, params=[]):
    payload = {"jsonrpc":"2.0","id":"1","method":method,"params":params}
    r = requests.post(EMC_RPC_URL, json=payload, auth=(EMC_RPC_USER, EMC_RPC_PASS))
    r.raise_for_status()
    return r.json()["result"]

def ness_rpc_call(method, params=[]):
    payload = {"jsonrpc":"2.0","id":"1","method":method,"params":params}
    r = requests.post(NESS_RPC_URL, json=payload, auth=(NESS_RPC_USER, NESS_RPC_PASS))
    r.raise_for_status()
    return r.json()["result"]

def deterministic_ticket_id(seed: bytes, ticket_seq: int, contract_id: str) -> str:
    return sha256(seed + ticket_seq.to_bytes(8,'big') + contract_id.encode()).hexdigest()

# ------------------------
# LOAD CONTRACTS FROM EmerNVS
# ------------------------
def load_contracts_from_nvs(prefix="sc_"):
    contracts = {}
    try:
        names = emc_rpc_call("name_list", [prefix])
        for n in names:
            value = emc_rpc_call("name_show", [n])
            data = json.loads(value['value'])
            contracts[n] = {
                "contract_id": n,
                "randpay_address": data["randpay_address"],
                "parties": {"payer": data.get("payer","unknown"), "payee": data.get("payee","unknown")},
                "script_cid": data.get("script_cid","")
            }
            log(f"Loaded contract {n} from NVS")
    except Exception as e:
        log(f"Failed to load contracts from NVS: {e}")
    return contracts

# ------------------------
# NESS SIGNING
# ------------------------
def prepare_and_sign_ness_tx(to, amount, contract_id):
    unsigned_tx = {"to": to, "amount": amount, "contract_id": contract_id}
    try:
        signed_tx = ness_rpc_call("sign_transaction", [unsigned_tx])
        return signed_tx
    except Exception as e:
        log(f"Failed signing NESS tx for {contract_id}: {e}")
        return None

# ------------------------
# POLL RANDPAY
# ------------------------
def poll_randpay():
    while True:
        try:
            for cid, contract in CONTRACTS.items():
                tickets = emc_rpc_call("randpay_listtickets", [contract["randpay_address"]])
                for ticket in tickets:
                    if ticket.get("won", False):
                        ticket_seq = ticket["sequence"]
                        ticket_hash = deterministic_ticket_id(UHE_SEED, ticket_seq, cid)
                        win = {"contract_id": cid, "ticket_seq": ticket_seq, "ticket_hash": ticket_hash,
                               "amount": ticket["amount"]}
                        RANDPAY_WINS.append(win)
                        log(f"Randpay win detected: {win}")

                        signed_tx = prepare_and_sign_ness_tx(contract['parties']['payee'], ticket["amount"], cid)
                        if signed_tx:
                            NESS_TXS.append(signed_tx)
                            log(f"Signed NESS tx: {signed_tx}")

                        if contract.get("script_cid"):
                            try:
                                SCRIPT_STATUS.append({"contract_id": cid, "status":"success"})
                                log(f"Script executed for contract {cid}")
                            except Exception as e:
                                SCRIPT_STATUS.append({"contract_id": cid, "status":"failed"})
                                log(f"Script failed for contract {cid}: {e}")

                        ch = next((c for c in COIN_HOURS if c["contract_id"]==cid), None)
                        if not ch:
                            COIN_HOURS.append({"contract_id": cid, "used": ticket["amount"]})
                        else:
                            ch["used"] += ticket["amount"]
        except Exception as e:
            log(f"[ERROR] {e}")
        time.sleep(POLL_INTERVAL)

# ------------------------
# FASTAPI
# ------------------------
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

# Serve dashboard
@app.get("/dashboard", response_class=HTMLResponse)
def serve_dashboard():
    dashboard_path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    with open(dashboard_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)

# ------------------------
# MAIN
# ------------------------
if __name__=="__main__":
    CONTRACTS = load_contracts_from_nvs()
    Thread(target=poll_randpay, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8043)
