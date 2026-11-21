# Input JSONL fields: question, reference, prediction, category. Lexical scores are only a rough diagnostic.
import argparse,json,re
from pathlib import Path
def tok(s): return re.findall(r'[a-z0-9]+',s.lower())
def f1(p,r):
 from collections import Counter
 a,b=tok(p),tok(r); n=sum((Counter(a)&Counter(b)).values()); return 0.0 if not a or not b or not n else 2*(n/len(a))*(n/len(b))/((n/len(a))+(n/len(b)))
def main():
 x=argparse.ArgumentParser(); x.add_argument('--input',required=True); x.add_argument('--out',default='eval/results/answers.json'); a=x.parse_args(); rows=[json.loads(z) for z in Path(a.input).read_text().splitlines() if z.strip()]; scores=[f1(r['prediction'],r['reference']) for r in rows]; out={'count':len(rows),'mean_token_f1':sum(scores)/len(scores) if scores else None,'exact_match':sum(r['prediction'].strip().lower()==r['reference'].strip().lower() for r in rows)/len(rows) if rows else None,'warning':'Lexical metrics do not establish semantic correctness.'}; Path(a.out).parent.mkdir(parents=True,exist_ok=True); Path(a.out).write_text(json.dumps(out,indent=2)); print(out)
if __name__=='__main__': main()
