// O armazenamento de Vega é independente do Redis do servidor Orbital.
const {hash,fail}=require('./store.cjs');
const {randomUUID}=require('node:crypto');
const etag=Symbol('etag');
const options={access:'private',addRandomSuffix:false};
const objectKey=nick=>'vega/v1/players/'+hash(nick.toLowerCase())+'.json';
const collision=()=>Object.assign(fail(409,'A conta mudou em outro aparelho. Tente de novo.'),{retryable:true});

async function fetchObject(path){
  const {get,BlobNotFoundError}=await import('@vercel/blob');
  let result;
  try{result=await get(path,{access:'private',useCache:false});}
  catch(error){if(error instanceof BlobNotFoundError)return null;throw error;}
  if(!result)return null;
  if(result.statusCode!==200||!result.stream)throw fail(503,'Vega não conseguiu ler o progresso.');
  const value=await new Response(result.stream).json();
  value[etag]=result.blob?.etag||result.headers?.get?.('etag');
  if(!value[etag])throw fail(503,'Não foi possível conferir a versão do progresso em Vega.');
  return value;
}
async function putObject(path,value){
  const {put,BlobPreconditionFailedError}=await import('@vercel/blob');
  const expected=value[etag];
  try{
    const result=await put(path,JSON.stringify(value),{...options,contentType:'application/json',
      allowOverwrite:!!expected,...(expected?{ifMatch:expected}:{})});
    value[etag]=result.etag;
  }catch(error){
    if(error instanceof BlobPreconditionFailedError||/already exists/i.test(error.message))throw collision();
    throw error;
  }
}
const read=nick=>fetchObject(objectKey(nick));
async function write(account){
  account.stamp=randomUUID();
  await putObject(objectKey(account.nick),account);
}
async function limit(address){
  const path='vega/v1/rate/'+hash(address)+'.json';
  for(let i=0;i<4;i++){
    const record=await fetchObject(path)||{until:0,count:0};
    if(Date.now()>=record.until){record.count=0;record.until=Date.now()+600000;}
    if(++record.count>60)throw fail(429,'Muitas tentativas. Aguarde alguns minutos.');
    try{await putObject(path,record);return;}
    catch(e){if(!e.retryable)throw e;}
  }
  throw fail(429,'Muitas tentativas simultâneas. Tente em instantes.');
}
module.exports={read,write,limit};

async function verifyStorage(){
  const {del}=await import('@vercel/blob');
  const path='vega/checks/'+randomUUID()+'.json', sample={version:1};
  await putObject(path,sample);
  try{
    const saved=await fetchObject(path);
    if(saved?.version!==1)throw Error('Falha na leitura de Vega.');
    saved.version=2;await putObject(path,saved);
    if((await fetchObject(path))?.version!==2)throw Error('Falha na atualização de Vega.');
    try{await putObject(path,sample);}
    catch(error){if(error.retryable)return;throw error;}
    throw Error('Vega aceitou uma gravação desatualizada.');
  }finally{await del(path);}
}
module.exports.verifyStorage=verifyStorage;
