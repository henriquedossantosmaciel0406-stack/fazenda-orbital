const accounts=require('../server/accounts.cjs');
const rooms=require('../server/http-rooms.cjs');
module.exports=(req,res)=>{
  const action=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).pop();
  if(action==='health'){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,region:process.env.VERCEL_REGION||'local'}));}
  if(action==='room')return rooms(req,res);
  if(['register','recover','session','login','save','logout','admin','prank-ticket','prank-check'].includes(action))return accounts(req,res,action);
  res.statusCode=404;res.end();
};
