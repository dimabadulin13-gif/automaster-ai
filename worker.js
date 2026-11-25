const ORIGIN='https://dimabadulin13-gif.github.io';
const MODEL='gemini-3.5-flash-lite';
export default {async fetch(req,env){
 const origin=req.headers.get('Origin'); const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};
 const out=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers});
 if(origin!==ORIGIN)return out({error:'Источник запроса не разрешён.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return out({error:'Только POST.'},405);
 if(!env.GEMINI_API_KEY||!env.ACCESS_CODE||env.ACCESS_CODE.length<16)return out({error:'Настрой секреты Worker.'},503);
 const auth=req.headers.get('Authorization')||''; const expected='Bearer '+env.ACCESS_CODE;
 let a=new TextEncoder().encode(auth),b=new TextEncoder().encode(expected);if(a.length!==b.length||!crypto.subtle.timingSafeEqual(a,b))return out({error:'Неверный код доступа.'},401);
 try{
 const reader=req.body?.getReader();if(!reader)return out({error:'Пустой запрос.'},400);let chunks=[],size=0;while(true){let {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3500000){await reader.cancel();return out({error:'Запрос слишком большой.'},413)}chunks.push(value)}let bytes=new Uint8Array(size),at=0;for(let c of chunks){bytes.set(c,at);at+=c.length}let body=JSON.parse(new TextDecoder().decode(bytes));if(body.ping===true)return out({ok:true});
 if(typeof body.context!=='string'||body.context.length>18000||!Array.isArray(body.contents)||body.contents.length<1||body.contents.length>7)return out({error:'Некорректный запрос.'},400);
 let imgs=0;for(let [i,m] of body.contents.entries()){if(!m||m.role!==(i%2===0?'user':'model')||!Array.isArray(m.parts)||!m.parts.length||m.parts.length>2)return out({error:'Некорректная история.'},400);for(let p of m.parts){if(typeof p.text==='string'&&p.text.length<=50000&&!p.inlineData)continue;if(m.role==='user'&&i===body.contents.length-1&&p.inlineData?.mimeType==='image/jpeg'&&typeof p.inlineData.data==='string'&&p.inlineData.data.length<=2500000&&/^[A-Za-z0-9+/]+={0,2}$/.test(p.inlineData.data)&&++imgs===1)continue;return out({error:'Некорректное сообщение или фото.'},400)}}
 if(body.contents.at(-1).role!=='user')return out({error:'Последнее сообщение должно быть вопросом.'},400);
 const safety='Ты помощник начинающего автомеханика. У тебя нет интернет-поиска или заводской базы. Не выдумывай технические характеристики, моменты затяжки, ссылки и расположение скрытых деталей. Критичные работы — только по заводской документации и под контролем квалифицированного механика. Ответ на русском.';
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+MODEL+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:safety+'\n'+body.context}]},contents:body.contents,generationConfig:{maxOutputTokens:6000}})});
 if(!r.ok){if(r.status===429)return out({error:'Лимит Gemini исчерпан или модель недоступна на тарифе.'},429);if(r.status===401||r.status===403)return out({error:'Проверь ключ, регион и разрешения Gemini.'},502);return out({error:'Gemini вернул ошибку '+r.status+'. Проверь настройки модели.'},502)}
 const j=await r.json(),c=j.candidates?.[0],text=c?.content?.parts?.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('\n');if(!text)return out({error:'ИИ не вернул текст. Переформулируй запрос.'},502);return out({text,truncated:c.finishReason==='MAX_TOKENS'});
 }catch(e){return out({error:'Не удалось обработать запрос или связаться с Gemini.'},502)}
}};
