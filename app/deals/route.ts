import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export async function GET() {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return new Response('Sign in through the portal to open Deals.', {status:401,headers:{'Cache-Control':'no-store'}});
    // This view is owned by portal authorization. Module/admin status is never
    // used to derive account or project capabilities, including on the landing page.
    const result = await client.from('portal_deals_capabilities').select('account_id,project_id,capability,active,valid_from,valid_to').eq('actor_id',user.id).eq('active',true).limit(501);
    if (result.error || !result.data || result.data.length>500) return new Response('Deals access is unavailable. Contact the workspace administrator.', {status:503,headers:{'Cache-Control':'no-store'}});
    const now=Date.now();
    const grants=result.data.filter(g=>(!g.valid_from||Date.parse(g.valid_from)<=now)&&(!g.valid_to||Date.parse(g.valid_to)>now));
    const links=new Map<string,string>();
    for (const grant of grants) {
      if (grant.project_id && ['view','edit','review'].includes(grant.capability)) links.set(`/deals/${grant.account_id}/workspace`,`Open Deals workspace`);
      if (!grant.project_id && grant.capability==='create_project') links.set(`/deals/${grant.account_id}/workspace/new`,`Create project in account ${grant.account_id}`);
    }
    const body=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Deals</title><main><a href="/dashboard">Portal home</a><h1>Deals workspace</h1><p>Only explicitly assigned projects appear here. Creating a project does not automatically grant access to it.</p><ul>${[...links].map(([href,label])=>`<li><a href="${escape(href)}">${escape(label)}</a></li>`).join('')}</ul>${links.size?'':'<p>No Deals project access has been assigned.</p>'}</main></html>`;
    return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});
  } catch { return new Response('Deals access is unavailable.',{status:503,headers:{'Cache-Control':'no-store'}}); }
}
