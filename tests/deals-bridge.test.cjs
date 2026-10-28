const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const source = fs.readFileSync(require('node:path').join(__dirname,'../app/deals/[accountId]/[...path]/route.ts'),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(compiled.diagnostics.length,0);
const account='11111111-1111-4111-8111-111111111111';
async function run({origin='https://portal.example',signedIn=true,path=['projects'],body='{}',method='POST'}={}) {
 let called=false,forwarded;
 const sandbox={exports:{},Request,Response,Headers,URL,AbortSignal,Uint8Array,process:{env:{DEALS_WORKSPACE_URL:'https://workspace.example',DEALS_PORTAL_ORIGIN:'https://portal.example'}},
  require:()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'actor'}:null},error:null}),getSession:async()=>({data:{session:{user:{id:'actor'},access_token:'private-token'}},error:null})}})}),
  fetch:async(url,options)=>{called=true;forwarded={url:String(url),...options};return Response.json({ok:true},{headers:{'set-cookie':'must-not-forward=1'}});}};
 vm.runInNewContext(compiled.outputText,sandbox);
 const request=new Request('https://portal.example/deals/'+account+'/projects',{method,headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin'},body:method==='POST'?body:undefined});
 const result=await sandbox.exports[method](request,{params:Promise.resolve({accountId:account,path})});
 return {result,called,forwarded};
}
(async()=>{
 let r=await run({origin:'https://attacker.example'});assert.equal(r.result.status,403);assert.equal(r.called,false);
 r=await run({signedIn:false});assert.equal(r.result.status,401);assert.equal(r.called,false);
 r=await run({path:['..','auth']});assert.equal(r.result.status,404);assert.equal(r.called,false);
 r=await run({body:'x'.repeat(1048577)});assert.equal(r.result.status,413);assert.equal(r.called,false);
 r=await run();assert.equal(r.result.status,200);assert.equal(r.forwarded.headers.Authorization,'Bearer private-token');
 assert.equal(r.forwarded.headers['X-Deals-Account'],account);assert.equal(r.forwarded.redirect,'error');
 assert.equal(r.result.headers.get('set-cookie'),null);assert.equal(r.result.headers.get('cache-control'),'no-store');
 assert.equal((await r.result.text()).includes('private-token'),false);
 console.log('5 bridge checks passed: origin, authentication, path, size, session forwarding/header filtering.');
})().catch(e=>{console.error(e);process.exitCode=1});
