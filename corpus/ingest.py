import argparse,json,re,hashlib
from pathlib import Path
try: import fitz
except ImportError: fitz=None
ROOT=Path(__file__).resolve().parent
def clean(s):
 s=s.replace("\x00"," "); s=re.sub(r"-\s*\n\s*","",s); s=re.sub(r"[ \t]+"," ",s); return re.sub(r"\n{3,}","\n\n",s).strip()
def pages(p):
 if p.suffix.lower()=='.pdf':
  if fitz is None: raise RuntimeError('pip install -r corpus/requirements.txt')
  d=fitz.open(p); return [(i+1,clean(x.get_text())) for i,x in enumerate(d)]
 return [(None,clean(p.read_text(encoding='utf-8',errors='replace')))]
def chunks(s,size=1100,overlap=150):
 out=[]
 while s:
  if len(s)<=size: part,s=s,''
  else:
   cut=s.rfind('\n\n',0,size)
   if cut<int(size*.5): cut=size
   part,s=s[:cut].strip(),s[max(0,cut-overlap):].strip()
  if part: out.append(part)
 return out
def main():
 a=argparse.ArgumentParser(); a.add_argument('--manifest',default='corpus/metadata/books.json'); a.add_argument('--output',default='corpus/processed/chunks.jsonl'); x=a.parse_args(); books=json.loads(Path(x.manifest).read_text()); o=Path(x.output); o.parent.mkdir(parents=True,exist_ok=True); n=0
 with o.open('w',encoding='utf-8') as f:
  for b in books:
   if not b.get('enabled'): continue
   p=ROOT/b['file']
   if not p.exists(): print('Missing:',p); continue
   if not b.get('license') or not b.get('license_url'): raise ValueError('Missing license metadata: '+b['id'])
   for page,text in pages(p):
    for i,c in enumerate(chunks(text)):
     cid=hashlib.sha1(f"{b['id']}|{page}|{i}|{c}".encode()).hexdigest()[:16]
     row={'chunk_id':cid,'book_id':b['id'],'title':b.get('title'),'short_title':b.get('short_title'),'subject':b.get('subject'),'page':page,'chunk_index':i,'text':c,'source_url':b.get('source_url'),'license':b.get('license'),'license_url':b.get('license_url'),'author':b.get('author'),'edition':b.get('edition')}
     f.write(json.dumps(row,ensure_ascii=False)+'\n'); n+=1
 print(f'Wrote {n} chunks to {o}')
if __name__=='__main__': main()
