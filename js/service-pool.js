// Cada rota atende a mesma sessão e o mesmo histórico de comandos.
const servers=['/api','/api/reserva','/api/apoio'];
let preferred=0;
export async function serviceRequest(route,options={},settings={}){
  const start=preferred;
  let lastError;
  for(let step=0;step<servers.length;step++){
    const index=(start+step)%servers.length;
    const send=(path,init,ms)=>fetch(servers[index]+'/'+path,{
      ...init,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(ms)
    });
    // Valida o servidor antes de operações que não podem ser repetidas.
    if(!settings.replay){
      try{
        const health=await send('health',{},2600);
        if(!health.ok||!(await health.json()).ok)throw Error('Servidor indisponível.');
      }catch(error){lastError=error;continue;}
    }
    try{
      const response=await send(route,options,settings.timeout||11000);
      if(response.status<500){preferred=index;return response;}
      preferred=(index+1)%servers.length;
      if(!settings.replay||step===servers.length-1)return response;
    }catch(error){
      preferred=(index+1)%servers.length;
      if(!settings.replay)throw error;
      lastError=error;
    }
  }
  throw lastError||Error('Servidores indisponíveis.');
}
