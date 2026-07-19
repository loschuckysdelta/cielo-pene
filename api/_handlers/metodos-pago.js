const { setCors, send, error, readBody, normalizeText, toBool } = require('../_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const cloud = require('../_lib/cloudinary');

function clean(body={}){
  return {
    nombre: normalizeText(body.nombre),
    tipo: normalizeText(body.tipo || 'otro').toLowerCase(),
    titular: normalizeText(body.titular),
    numero: normalizeText(body.numero),
    instrucciones: normalizeText(body.instrucciones),
    qr: normalizeText(body.qr),
    activo: toBool(body.activo, true),
    orden: Math.max(0, Number(body.orden)||0),
    updatedAt: new Date().toISOString()
  };
}
async function uploadQr(data){ if(data.qr && data.qr.startsWith('data:image/')) data.qr = await cloud.uploadBase64(data.qr, 'cielo_postres/metodos_pago'); return data; }
module.exports=async function(req,res){ if(setCors(req,res))return; try{
  const col=await collection('metodosPago');
  if(req.method==='GET'){
    const admin=String(req.query?.admin||'')==='1'; if(admin && !(await requireAuth(req,res,'configuracion')))return;
    let list=col?await col.find(admin?{}:{activo:{$ne:false}}).sort({orden:1,createdAt:1}).toArray():(memory.metodosPago||[]).filter(x=>admin||x.activo!==false).sort((a,b)=>(a.orden||0)-(b.orden||0));
    return send(res,200,{ok:true,data:publicList(list)});
  }
  const auth=await requireAuth(req,res,'configuracion'); if(!auth)return;
  const body=await readBody(req);
  if(req.method==='POST'){
    let data=await uploadQr(clean(body)); if(!data.nombre)return error(res,400,'El nombre del método es obligatorio.');
    data.createdAt=new Date().toISOString(); if(col){const r=await col.insertOne(data);data._id=r.insertedId}else{data.id=memoryId();memory.metodosPago=memory.metodosPago||[];memory.metodosPago.push(data)}
    return send(res,201,{ok:true,data:publicDoc(data)});
  }
  if(req.method==='PUT'){
    const id=normalizeText(body.id||req.query?.id); let data=await uploadQr(clean(body)); if(!id)return error(res,400,'ID obligatorio.');
    if(col){const _id=oid(id);if(!_id)return error(res,400,'ID inválido.');await col.updateOne({_id},{$set:data});return send(res,200,{ok:true,data:publicDoc(await col.findOne({_id}))})}
    const i=(memory.metodosPago||[]).findIndex(x=>x.id===id);if(i<0)return error(res,404,'Método no encontrado.');memory.metodosPago[i]={...memory.metodosPago[i],...data};return send(res,200,{ok:true,data:memory.metodosPago[i]});
  }
  if(req.method==='DELETE'){
    const id=normalizeText(req.query?.id||body.id); if(col){const _id=oid(id);if(!_id)return error(res,400,'ID inválido.');await col.deleteOne({_id})}else memory.metodosPago=(memory.metodosPago||[]).filter(x=>x.id!==id);
    return send(res,200,{ok:true,data:{deleted:true}});
  }
  return error(res,405,'Método no permitido.');
}catch(e){return error(res,500,e.message||'Error en métodos de pago.')}};
