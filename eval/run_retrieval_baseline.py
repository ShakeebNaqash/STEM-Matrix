import argparse,json
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
def read(p): return [json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
def main():
 p=argparse.ArgumentParser(); p.add_argument('--chunks',required=True); p.add_argument('--questions',required=True); p.add_argument('--out',default='eval/results/retrieval.json'); p.add_argument('--k',type=int,default=5); a=p.parse_args(); cs=read(a.chunks); qs=read(a.questions)
 if not cs: raise SystemExit('No chunks. Run corpus/ingest.py first.')
 v=TfidfVectorizer(stop_words='english',ngram_range=(1,2),max_features=200000); m=v.fit_transform([x['text'] for x in cs]); hits=[]; rr=[]; details=[]
 for q in qs:
  s=cosine_similarity(v.transform([q['question']]),m).ravel(); top=s.argsort()[::-1][:a.k]; rel=set(q.get('relevant_chunk_ids',[])); rank=next((i+1 for i,j in enumerate(top) if cs[j]['chunk_id'] in rel),None)
  if rel: hits.append(float(rank is not None)); rr.append(1/rank if rank else 0)
  details.append({'question':q['question'],'top_chunks':[{'chunk_id':cs[j]['chunk_id'],'score':float(s[j]),'book_id':cs[j].get('book_id'),'page':cs[j].get('page')} for j in top]})
 result={'k':a.k,'chunks':len(cs),'questions':len(qs),'recall_at_k':sum(hits)/len(hits) if hits else None,'mrr':sum(rr)/len(rr) if rr else None,'details':details,'note':'Only questions with non-empty relevant_chunk_ids contribute to Recall/MRR.'}; Path(a.out).parent.mkdir(parents=True,exist_ok=True); Path(a.out).write_text(json.dumps(result,indent=2)); print({k:v for k,v in result.items() if k!='details'})
if __name__=='__main__': main()
