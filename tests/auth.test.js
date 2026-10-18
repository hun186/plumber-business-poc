const test = require('node:test');
const assert = require('node:assert/strict');
const {enabled,authenticated,trustedOrigin,sessionCookie} = require('../api/_auth');
const prev = {DATABASE_URL:process.env.DATABASE_URL,APP_ADMIN_PASSWORD:process.env.APP_ADMIN_PASSWORD,AUTH_SECRET:process.env.AUTH_SECRET};
function setEnv(){process.env.DATABASE_URL='postgresql://example.invalid/test';process.env.APP_ADMIN_PASSWORD='demo-long-password-for-tests';process.env.AUTH_SECRET='test-secret-has-32-or-more-characters'}
process.on('exit',()=>{for(const [k,v] of Object.entries(prev))if(v===undefined)delete process.env[k];else process.env[k]=v});
test('demo mode is disabled for API authentication',()=>{delete process.env.AUTH_SECRET;assert.equal(enabled(),false);assert.equal(authenticated({headers:{}}),false)});
test('a valid signed session authenticates and tampering is rejected',()=>{setEnv();const token=sessionCookie().split(';')[0];assert.equal(authenticated({headers:{cookie:token}}),true);assert.equal(authenticated({headers:{cookie:token+'bad'}}),false);assert.equal(authenticated({headers:{cookie:'poc_session=1111111111111.invalid'}}),false)});
test('cross-origin requests are rejected',()=>{const req={headers:{origin:'https://poc.example.com',host:'poc.example.com'}};assert.equal(trustedOrigin(req),true);req.headers.origin='https://evil.example.com';assert.equal(trustedOrigin(req),false)});
