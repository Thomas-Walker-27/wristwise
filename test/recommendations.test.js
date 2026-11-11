import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { initialize } from '../lib/database.js';
import { digest } from '../lib/passwords.js';
import { createRecommendationsHandler } from '../lib/recommendations.js';
import { generateRecommendations } from '../lib/openai.js';
const preferences = { minBudget:100, maxBudget:500, style:'Everyday', brands:'Seiko', interests:'First automatic watch' };
const result = { introduction:'Three places to start.', watches:Array.from({length:3},(_,i)=>({name:`Watch ${i+1}`,estimated_price_usd:200,why_it_fits:'An everyday option.',movement:'Automatic, powered by wrist motion.',learn:'A mechanical movement uses a spring.',tradeoff:'Needs regular wear or winding.'})) };
async function setup(generate=async()=>result) {
 const db=new PGlite();await initialize(db);
 const user=randomUUID(),other=randomUUID();
 await db.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3),($4,$5,$3)',[user,'one@example.com','unused',other,'two@example.com']);
 await db.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 day'),($3,$4,NOW()+INTERVAL '1 day')",[digest('a'.repeat(64)),user,digest('b'.repeat(64)),other]);
 const handler=createRecommendationsHandler(()=>db,generate);
 async function call(method='GET',body,token='a'.repeat(64),headers={}){
  const req={url:'/api/recommendations',method,body,headers:{host:'localhost',origin:'http://localhost','content-type':'application/json',cookie:`wristwise_session=${token}`,...headers}};
  const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;}};await handler(req,res);return res;
 }
 return {db,call};
}
test('authenticated recommendations persist, remain private, expire with sessions, and enforce quota',async()=>{
 let calls=0;const {db,call}=await setup(async()=>{calls++;return result;});
 try{
  assert.equal((await call('POST',preferences,'')).code,401);assert.equal(calls,0);
  assert.equal((await call('POST',{...preferences,minBudget:600})).code,400);assert.equal(calls,0);
  assert.equal((await call('POST',preferences,undefined,{origin:'https://evil.example'})).code,403);
  const created=await call('POST',preferences);assert.equal(created.code,201);assert.deepEqual(created.data.recommendation.result,result);
  assert.equal((await call()).data.recommendations.length,1);
  assert.equal((await call('GET',null,'b'.repeat(64))).data.recommendations.length,0);
  for(let i=1;i<10;i++)assert.equal((await call('POST',preferences)).code,201);
  assert.equal((await call('POST',preferences)).code,429);assert.equal(calls,10);
  assert.equal((await call()).data.recommendations.length,5);
  await db.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 day'");
  assert.equal((await call()).code,401);
 }finally{await db.close();}
});
test('provider errors preserve history and expose no secrets',async()=>{
 const {db,call}=await setup(async()=>{throw Object.assign(new Error('secret must stay private'),{code:'provider_limit'});});
 try{const failed=await call('POST',preferences);assert.equal(failed.code,503);assert.ok(!JSON.stringify(failed.data).includes('secret'));assert.equal((await call()).data.recommendations.length,0);}finally{await db.close();}
});
test('OpenAI request uses structured output and excludes identity; rejects bad and over-budget output',async()=>{
 let sent;
 const response=output=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]})});
 const actual=await generateRecommendations(preferences,{apiKey:'test-key',fetcher:async(url,options)=>{sent={url,options};return response(result);}});
 assert.deepEqual(actual,result);assert.equal(sent.url,'https://api.openai.com/v1/responses');
 const body=JSON.parse(sent.options.body);assert.equal(body.text.format.type,'json_schema');assert.equal(body.store,false);assert.deepEqual(JSON.parse(body.input),preferences);
 const invalid=structuredClone(result);invalid.watches[0].estimated_price_usd=5000;
 await assert.rejects(generateRecommendations(preferences,{apiKey:'test',fetcher:async()=>response(invalid)}),{code:'invalid_response'});
 await assert.rejects(generateRecommendations(preferences,{apiKey:'test',fetcher:async()=>({ok:false,status:429})}),{code:'provider_limit'});
 await assert.rejects(generateRecommendations(preferences,{apiKey:''}),{code:'missing_key'});
 await assert.rejects(generateRecommendations(preferences,{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({status:'incomplete'})})}),{code:'invalid_response'});
});
