/**
 * Private PR16 iPhone acceptance shell. No D1, AI, or customer-data bindings.
 * Cloudflare Access must deny anonymous traffic before this Worker is deployed.
 */
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')){
      return Response.json({error:'Online services are deliberately disabled in the synthetic-only iPhone preview.',mode:'offline-only',online:false},
        {status:503,headers:{'Cache-Control':'no-store'}});
    }
    return env.ASSETS.fetch(request);
  }
};
