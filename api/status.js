const {enabled}=require('./_auth');
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');res.status(200).json({mode:enabled()?'sqlite':'demo',version:'0.2.0',sqlitePersistent:enabled(),message:process.env.VERCEL?'Vercel 展示模式：無持久性 SQLite 檔案，請勿輸入真實資料':undefined})};
