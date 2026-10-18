const crypto = require('node:crypto');
const enabled = () => Boolean(!process.env.VERCEL && process.env.SQLITE_PATH && process.env.APP_ADMIN_PASSWORD && process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
function sign(value){return crypto.createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex')}
function sessionCookie(req){
 const host=String(req?.headers?.host||'');
 // Only direct loopback development may use HTTP session cookies; HTTPS/proxied sessions require Secure.
 const loopbackHost=/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
 const remote=req?.socket?.remoteAddress;
 const loopbackPeer=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote);
 const directLocal=loopbackHost&&loopbackPeer&&!req?.headers?.['x-forwarded-proto']&&!req?.headers?.['x-forwarded-host']&&process.env.NODE_ENV!=='production';
 const expire=Date.now()+8*3600_000;const data=String(expire);
 return `poc_session=${data}.${sign(data)}; Max-Age=28800; HttpOnly; ${directLocal?'':'Secure; '}SameSite=Strict; Path=/api`;
}
function authenticated(req){if(!enabled())return false;const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());const token=(cookies.find(x=>x.startsWith('poc_session='))||'').split('=')[1]||'';const [stamp,sig]=token.split('.');if(!/^\d{13}$/.test(stamp)||Number(stamp)<Date.now()||!sig||sig.length!==64)return false;const expected=Buffer.from(sign(stamp),'hex'),provided=Buffer.from(sig,'hex');return provided.length===expected.length&&crypto.timingSafeEqual(expected,provided)}
function trustedOrigin(req){const origin=req.headers.origin;if(!origin)return false;try{return new URL(origin).host===req.headers.host}catch{return false}}
module.exports={enabled,authenticated,trustedOrigin,sessionCookie};
