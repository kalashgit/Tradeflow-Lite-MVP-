/* TF-MI-CONV-02 — browser transport for the existing authenticated office blocker
 * answer route. This is a read-only data port for the *existing* conversation
 * bridge, not a new chat service, local authority or command dispatcher.
 *
 * Cloudflare Access session cookies are supplied by the browser. Never store,
 * copy or synthesize access tokens in localStorage, messages or logs.
 */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const bounded=x=>typeof x==='string'&&x.trim().length>=3&&x.length<=300;
export function createAuthenticatedOfficeReplyFetcher({
 fetcher=(...args)=>fetch(...args),timeoutMs=10000
}={}){
 if(typeof fetcher!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>30000)throw Error('Verified read transport required');
 return async function fetchOfficeReply({
  businessId,jobId,eventId,threadId=null,question,expectedJobRevision=null
 }={}){
  if(![businessId,jobId,eventId].every(id)||!bounded(question)||
     (threadId!==null&&!id(threadId))||
     (expectedJobRevision!==null&&(!Number.isSafeInteger(expectedJobRevision)||
      expectedJobRevision<1)))
   throw Error('Invalid job-scoped office read request');
  const params=new URLSearchParams({question:question.trim()});
  if(threadId!==null)params.set('threadId',threadId);
  if(expectedJobRevision!==null)params.set('expectedJobRevision',String(expectedJobRevision));
  const url='/api/v1/businesses/'+businessId+'/intelligence/jobs/'+jobId+
    '/blockers/'+eventId+'/answer?'+params;
  let response;
  try{
   response=await fetcher(url,{
    method:'GET',credentials:'same-origin',redirect:'manual',cache:'no-store',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{throw Error('Authenticated job read unavailable; no local success recorded')}
  if(response?.type==='opaqueredirect'||!response||!response.ok)
   throw Error('Authenticated job read was denied or unavailable; no response saved');
  if(!/^application\/json\b/i.test(response.headers?.get?.('Content-Type')||''))
   throw Error('Authenticated job read did not return JSON');
  let data;
  try{data=await response.json()}catch{throw Error('Authenticated job read returned invalid JSON')}
  if(data?.kind!=='tradeflow.intelligence.conversation_reply.v1'||
     data.status!=='source_grounded_unsaved'||data.businessId!==businessId||
     data.jobId!==jobId||data.thread?.id!==(threadId??null)||
     data.commandExecuted!==false||data.executionAuthority!==false||
     !Number.isSafeInteger(data.source?.revision)||
     (expectedJobRevision!==null&&data.source.revision!==expectedJobRevision))
   throw Error('Authenticated job read response does not match requested scope');
  return data;
 };
}
