const { setCors, send, error, readBody, normalizeText } = require('./_lib/http');
const { collection, oid, publicDoc, publicList, memory, memoryId } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const cloud = require('./_lib/cloudinary');

module.exports=async function(req,res){if(setCors(req,res))return;try{
 const col=await collection('comprobantesPago');
 if(req.method==='GET'){
   const auth=await requireAuth(req,res,'pedidos');if(!auth)return;
   const filter={}; if(req.query?.estado)filter.estado=normalizeText(req.query.estado);
   const list=col?await col.find(filter).sort({createdAt:-1}).toArray():(memory.comprobantesPago||[]).filter(x=>!filter.estado||x.estado===filter.estado).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   return send(res,200,{ok:true,data:publicList(list)});
 }
 const body=await readBody(req);
 if(req.method==='POST'){
   const pedidoId=normalizeText(body.pedidoId), metodoId=normalizeText(body.metodoId), imagen=normalizeText(body.imagen), pagador=normalizeText(body.pagador), referencia=normalizeText(body.referencia);
   if(!pedidoId||!metodoId||!imagen)return error(res,400,'Pedido, método e imagen del comprobante son obligatorios.');
   if(!imagen.startsWith('data:image/'))return error(res,400,'El comprobante debe ser una imagen.');
   if(imagen.length>8_000_000)return error(res,413,'La imagen es demasiado grande. Máximo aproximado: 5 MB.');
   const uploaded=await cloud.uploadBase64WithMeta(imagen,'cielo_postres/comprobantes');
   const data={pedidoId,metodoId,metodoNombre:normalizeText(body.metodoNombre),pagador,referencia,imagen:uploaded.url,publicId:uploaded.publicId||'',estado:'pendiente',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   if(col){const r=await col.insertOne(data);data._id=r.insertedId}else{data.id=memoryId();memory.comprobantesPago=memory.comprobantesPago||[];memory.comprobantesPago.push(data)}
   return send(res,201,{ok:true,data:publicDoc(data)});
 }
 if(req.method==='PUT'){
   const auth=await requireAuth(req,res,'pedidos');if(!auth)return; const id=normalizeText(body.id||req.query?.id); const estado=normalizeText(body.estado);
   if(!['confirmado','rechazado','pendiente'].includes(estado))return error(res,400,'Estado inválido.');
   let doc;if(col){const _id=oid(id);if(!_id)return error(res,400,'ID inválido.');doc=await col.findOne({_id});if(!doc)return error(res,404,'Comprobante no encontrado.');await col.updateOne({_id},{$set:{estado,notaAdmin:normalizeText(body.notaAdmin),updatedAt:new Date().toISOString(),revisadoPor:auth.user.email||auth.user.nombre||'admin'}});doc=await col.findOne({_id});}
   else{const i=(memory.comprobantesPago||[]).findIndex(x=>x.id===id);if(i<0)return error(res,404,'Comprobante no encontrado.');memory.comprobantesPago[i]={...memory.comprobantesPago[i],estado,notaAdmin:normalizeText(body.notaAdmin),updatedAt:new Date().toISOString()};doc=memory.comprobantesPago[i];}
   if(estado==='confirmado' && doc.publicId){await cloud.destroy(doc.publicId); if(col)await col.updateOne({_id:doc._id},{$set:{imagen:'',publicId:'',imagenEliminadaAt:new Date().toISOString()}});else{doc.imagen='';doc.publicId='';doc.imagenEliminadaAt=new Date().toISOString();}}
   const pedidos=await collection('pedidos'); if(pedidos){const pid=oid(doc.pedidoId);if(pid)await pedidos.updateOne({_id:pid},{$set:{pagoEstado:estado,pagoMetodo:doc.metodoNombre||'',updatedAt:new Date().toISOString()}})}else{const p=(memory.pedidos||[]).find(x=>x.id===doc.pedidoId);if(p){p.pagoEstado=estado;p.pagoMetodo=doc.metodoNombre||''}}
   return send(res,200,{ok:true,data:publicDoc(doc)});
 }
 return error(res,405,'Método no permitido.');
}catch(e){return error(res,500,e.message||'Error en comprobantes.')}};
