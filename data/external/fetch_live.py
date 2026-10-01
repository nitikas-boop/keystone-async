"""Re-runnable snapshot of the two live sources: Federal Register API and SEC EDGAR 10-Ks.

    python data/external/fetch_live.py
"""
import json, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
UA = {"User-Agent": "Keystone demo keystone-demo@example.com"}  # SEC rejects requests without a contact UA


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def federal_register(since="2024-01-01"):
    # final rules on data retention / cybersecurity / cloud, newest first; publication_date drives the "as of" slider
    q = urllib.parse.urlencode([
        ("conditions[term]", '"data retention"|cybersecurity|cloud'),
        ("conditions[publication_date][gte]", since),
        ("conditions[type][]", "RULE"),
        ("order", "newest"), ("per_page", 1000),
        *[("fields[]", f) for f in ("document_number", "title", "type", "abstract", "publication_date",
                                    "effective_on", "agencies", "html_url", "raw_text_url")],
    ])
    docs = json.loads(get(f"https://www.federalregister.gov/api/v1/documents.json?{q}"))["results"]
    out = ROOT / "federal-register" / "rules.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(docs, indent=1), encoding="utf-8")
    print(f"federal register: {len(docs)} rules since {since}")


def edgar(cik="0000789019", years=6):
    # one company's 10-Ks across years, so a newer filing can contradict an older commitment
    sub = json.loads(get(f"https://data.sec.gov/submissions/CIK{cik}.json"))
    r = sub["filings"]["recent"]
    out = ROOT / "sec-edgar" / sub["tickers"][0]
    out.mkdir(parents=True, exist_ok=True)
    picked = [i for i, f in enumerate(r["form"]) if f == "10-K"][:years]
    for i in picked:
        acc = r["accessionNumber"][i].replace("-", "")
        dest = out / f"10-K_{r['filingDate'][i]}.htm"
        if not dest.exists():
            dest.write_bytes(get(f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{r['primaryDocument'][i]}"))
            time.sleep(0.2)  # SEC fair-access limit is 10 req/s
    print(f"edgar: {len(picked)} 10-Ks for {sub['name']} -> {out}")


if __name__ == "__main__":
    federal_register()
    edgar()
