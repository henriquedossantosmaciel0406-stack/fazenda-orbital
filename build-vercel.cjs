const fs=require('node:fs');
const path=require('node:path');
if(process.env.VERCEL_ENV==='production'&&(!(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL)||!(process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN))){
  throw new Error('Conecte o Upstash Redis ao ambiente Production antes de publicar o jogo.');
}
const out=path.join(__dirname,'dist');
fs.mkdirSync(out,{recursive:true});
for(const name of ['js','assets','style.css']){
  const target=path.join(out,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(path.join(__dirname,name),target,{recursive:true});
}
const page=fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
  .replace('<head>','<head><meta name="orbital-relay" content="/api/room">');
fs.writeFileSync(path.join(out,'index.html'),page);

if(process.env.VERCEL_ENV==='production'){
  require('./server/vega.cjs').verifyStorage().then(()=>console.log('Contas: leitura, gravação e controle de versão verificados.')).catch(error=>{
    console.error('Teste do armazenamento privado de contas:',error.name);
    process.exitCode=1;
  });
}
