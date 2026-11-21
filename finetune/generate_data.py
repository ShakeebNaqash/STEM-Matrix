import argparse,json,random
from pathlib import Path
def main():
 p=argparse.ArgumentParser(); p.add_argument('--chunks',default='corpus/processed/chunks.jsonl'); p.add_argument('--output',default='finetune/data/instructions.jsonl'); p.add_argument('--limit',type=int,default=3000); a=p.parse_args(); rows=[]
 for line in Path(a.chunks).read_text(encoding='utf-8').splitlines():
  c=json.loads(line); t=c['text'].strip()
  if len(t)<180: continue
  title=c.get('short_title') or c.get('title') or 'the textbook'
  rows.append({'instruction':f"Explain the key STEM ideas in this passage from {title} for an undergraduate student.",'input':f"Use only this context; state when it is insufficient.\n\n{t}",'output':t[:900],'source_chunk_ids':[c['chunk_id']],'book_id':c['book_id'],'task_type':'extractive_grounded_baseline'})
  if len(rows)>=a.limit: break
 Path(a.output).parent.mkdir(parents=True,exist_ok=True); Path(a.output).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8'); print('Rows:',len(rows),'Review targets before training; these are extractive weak labels.')
if __name__=='__main__': main()
