import argparse,json,random
from pathlib import Path
def main():
 p=argparse.ArgumentParser(); p.add_argument('--input',required=True); p.add_argument('--output',required=True); p.add_argument('--valid-output',required=True); p.add_argument('--seed',type=int,default=42); a=p.parse_args(); rows=[json.loads(x) for x in Path(a.input).read_text().splitlines() if x.strip()]; random.Random(a.seed).shuffle(rows); n=max(1,int(.1*len(rows))) if len(rows)>1 else 0
 for path,data in ((a.output,rows[n:]),(a.valid_output,rows[:n])):
  Path(path).parent.mkdir(parents=True,exist_ok=True); Path(path).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in data))
 print('train',len(rows[n:]),'valid',len(rows[:n]))
if __name__=='__main__': main()
