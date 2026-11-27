const accounts=require('../server/accounts.cjs');
const rooms=require('../server/http-rooms.cjs');
module.exports=(req,res)=>{
  const action=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).pop();
  if(action==='room')return rooms(req,res);
  if(['register','copy','recover','session','login','save','logout','admin'].includes(action))return accounts(req,res,action);
  res.statusCode=404;res.end();
};
