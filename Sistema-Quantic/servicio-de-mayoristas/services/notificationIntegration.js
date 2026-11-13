import { randomUUID } from 'node:crypto';
import StockBatch from '../models/stockBatch.js';
const baseUrl = () => (process.env.INTEGRATION_ESB_URL || 'http://127.0.0.1:8003').replace(/\/$/, '');
export async function sendNotificationEvent(job, supplier, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
 const key=process.env.INTEGRATION_ESB_KEY||''; if(Buffer.byteLength(key)<32){const e=new Error('INTEGRATION_ESB_KEY no está configurada correctamente.');throw e;}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
 let path,body;
 if(job.eventType==='cancel-schedule'){path='cancel';body={SupplierId:supplier.supplierId};}
 else if(job.eventType==='catalog-updated'){path='catalogUpdated';body={SupplierId:supplier.supplierId,UpdatedAt:job.catalogAt.toISOString()};}
 else {const latest=await StockBatch.findOne({supplierId:supplier.supplierId,estado:'PROCESADO'}).sort({processedAt:-1}).select('processedAt').lean();const baseline=latest?.processedAt||supplier.createdAt;path='register';body={SupplierId:supplier.supplierId,SupplierName:supplier.nombre,ContactEmail:supplier.correoContacto,UpdatePeriodDays:supplier.periodoActualizacionDias,LastCatalogUpdate:baseline.toISOString(),AdditionalMessage:supplier.additionalMessage||''};}
 try{const response=await fetchImpl(`${baseUrl()}/v1/notifications/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-ESB-Key':key,'X-Correlation-ID':job.eventId||randomUUID()},body:JSON.stringify(body),signal:controller.signal});const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.message||`ESB respondió HTTP ${response.status}.`);e.status=response.status;e.permanent=response.status>=400&&response.status<500&&![408,429].includes(response.status);throw e;}return data;}catch(err){if(err.name==='AbortError'){const e=new Error('Tiempo de espera agotado al contactar el ESB.');e.status=504;throw e;}throw err;}finally{clearTimeout(timer);}
}

