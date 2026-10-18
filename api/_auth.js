const crypto = require('node:crypto');
const enabled = () => Boolean(process.env.DATABASE_URL && process.env.APP_ADMIN_PASSWORD && process.env.AUTH_SECRET);
function sign(value){return crypto.createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex')}
function sessionCookie(){const expire=Date.now()+8*3600_000;const data=String(expire);return `poc_session=${data}.${sign(data)}; Max-Age=28800; HttpOnly; Secure; SameSite=Strict; Path=/api`}
function authenticated(req){if(!enabled())return false;const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());const token=(cookies.find(x=>x.startsWith('poc_session='))||'').split('=')[1]||'';const [stamp,sig]=token.split('.');if(!/^\d{13}$/.test(stamp)||Number(stamp)<Date.now()||!sig||sig.length!==64)return false;const expected=Buffer.from(sign(stamp),'hex'),provided=Buffer.from(sig,'hex');return provided.length===expected.length&&crypto.timingSafeEqual(expected,provided)}
function trustedOrigin(req){const origin=req.headers.origin;if(!origin)return false;try{return new URL(origin).host===req.headers.host}catch{return false}}
module.exports={enabled,authenticated,trustedOrigin,sessionCookie};
