const {enabled}=require('./_auth');
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');res.status(200).json({mode:enabled()?'database':'demo',version:'0.1.0'})};
