import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../lib/auth.js';
import { digest } from '../lib/passwords.js';

async function fixture() {
  const db = new PGlite();
  const handler = createHandler(() => db);
  async function call(action, body, cookie, extra = {}) {
    const req = { url: `/api/auth?action=${action}`, method: body ? 'POST' : 'GET', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', cookie, ...extra } , body };
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(data) { this.data = data; } };
    await handler(req, res);
    return res;
  }
  return { db, call };
}
test('signup persists a hashed account; session survives a new handler; logout and later login work', async () => {
  const { db, call } = await fixture();
  try {
    assert.equal((await call('me')).code, 401);
    const signup = await call('signup', { email: ' Watch@Example.com ', password: 'My-watch-password!' });
    assert.equal(signup.code, 201);
    assert.deepEqual(Object.keys(signup.data.user).sort(), ['email','id']);
    assert.equal(signup.data.user.email, 'watch@example.com');
    const cookie = signup.headers['Set-Cookie'].split(';')[0];
    assert.match(signup.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
    const account = (await db.query('SELECT * FROM users')).rows[0];
    assert.notEqual(account.password_hash, 'My-watch-password!');
    const sessions = (await db.query('SELECT * FROM sessions')).rows;
    assert.equal(sessions[0].token_hash, digest(cookie.split('=')[1]));
    assert.equal((await call('me', null, cookie)).data.user.email, 'watch@example.com');
    const restored = createHandler(() => db);
    const res = { setHeader(){}, status(n){this.code=n;return this;}, json(d){this.data=d;} };
    await restored({url:'/api/auth?action=me',method:'GET',headers:{cookie}},res);
    assert.equal(res.code,200);
    assert.equal((await call('signup', {email:'watch@example.com',password:'My-watch-password!'})).code,409);
    assert.equal((await call('logout', {}, cookie)).code,200);
    assert.equal((await call('me', null, cookie)).code,401);
    assert.equal((await call('login',{email:'watch@example.com',password:'wrong-password'})).code,401);
    assert.equal((await call('login',{email:'missing@example.com',password:'wrong-password'})).code,401);
    const login=await call('login',{email:'WATCH@example.com',password:'My-watch-password!'});
    assert.equal(login.code,200);
    await db.query("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 day'");
    assert.equal((await call('me',null,login.headers['Set-Cookie'].split(';')[0])).code,401);
  } finally { await db.close(); }
});
test('rejects cross-origin, malformed inputs and repeated guesses', async () => {
 const {db,call}=await fixture();
 try {
   assert.equal((await call('signup',{email:'a@example.com',password:'password123'},null,{origin:'https://evil.example'})).code,403);
   assert.equal((await call('signup',{email:'bad',password:'tiny'})).code,400);
   assert.equal((await call('login',{email:'a@example.com',password:'x'.repeat(129)})).code,400);
   for(let i=0;i<20;i++) assert.equal((await call('login',{email:'a@example.com',password:'password123'})).code,401);
   assert.equal((await call('login',{email:'a@example.com',password:'password123'})).code,429);
 } finally { await db.close(); }
});
test('missing database configuration returns a safe error', async()=>{
 const handler=createHandler(()=>{throw Error('sensitive connection string');});
 const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;}};
 await handler({url:'/api/auth?action=me',method:'GET',headers:{}},res);
 assert.equal(res.code,503);
 assert.ok(!JSON.stringify(res.data).includes('sensitive'));
});
