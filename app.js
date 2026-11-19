'use strict';
const $=s=>document.querySelector(s);
const API=(window.PUBLIC_CONFIG?.apiBase||'').replace(/\/$/,'');
const STORAGE_KEY='private_universe_v3_session';
const screens=['setup','login','expired','loading','story'];
let token=sessionStorage.getItem(STORAGE_KEY)||'';
let story=null,step=0,expiresAt=null,clockHandle=null,statusHandle=null,observer=null;
let letterId=null;
const images=new Map();
function makeId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const v=crypto.getRandomValues(new Uint8Array(16));v[6]=(v[6]&15)|64;v[8]=(v[8]&63)|128;const a=Array.from(v,x=>x.toString(16).padStart(2,'0')).join('');return [a.slice(0,8),a.slice(8,12),a.slice(12,16),a.slice(16,20),a.slice(20)].join('-')}
function el(tag,attrs={},text){const node=document.createElement(tag);for(const [key,val] of Object.entries(attrs)){if(key==='class')node.className=val;else if(key==='type')node.type=val;else node.setAttribute(key,String(val));}if(text!==undefined)node.textContent=String(text);return node;}
function showScreen(which){for(const s of screens)$('#'+s+'-screen').hidden=s!==which;$('#timer').hidden=which!=='story';$('#logout-button').hidden=which!=='story';$('#music-button').hidden=which!=='story'||!spotifyUrl();if(which!=='story'){clearInterval(clockHandle);clearInterval(statusHandle)}window.scrollTo({top:0,behavior:'instant'});}
function spotifyUrl(){const u=window.PUBLIC_CONFIG?.spotifyEmbedUrl||'';return /^https:\/\/open\.spotify\.com\/embed\/(track|playlist|album)\/[a-zA-Z0-9]+(?:\?.*)?$/.test(u)?u:'';}
function clearPrivate(){token='';story=null;expiresAt=null;sessionStorage.removeItem(STORAGE_KEY);for(const u of images.values())URL.revokeObjectURL(u);images.clear();if(observer)observer.disconnect();const v=$('video');if(v)v.pause();}
async function api(path,{method='GET',data=null,auth=true,blob=false}={}){
 const h={};if(data)h['Content-Type']='application/json';if(auth&&token)h.Authorization='Bearer '+token;
 let response;
 try{response=await fetch(API+path,{method,headers:h,cache:'no-store',body:data?JSON.stringify(data):undefined});}
 catch(_e){throw new Error('Sin conexión con el servicio privado. Revisa la configuración o tu conexión a internet.');}
 if(!response.ok){let detail={};try{detail=await response.json();}catch(_){}const error=new Error(detail.error||'Ocurrió un problema de conexión.');error.status=response.status;error.expired=detail.expired;throw error;}
 return blob?response.blob():response.json();
}
async function login(pin){showScreen('loading');try{
  const response=await api('/api/login',{method:'POST',data:{pin},auth:false});
  token=response.token;expiresAt=response.expiresAt;sessionStorage.setItem(STORAGE_KEY,token);
  story=await api('/api/story');renderChapter(0);startClocks();
 }catch(err){if(err.status===410){clearPrivate();showScreen('expired')}else{showScreen('login');$('#login-feedback').textContent=err.message}}
}
async function restoreSession(){if(!token){showScreen('login');return}showScreen('loading');try{const [state,s]=await Promise.all([api('/api/status'),api('/api/story')]);expiresAt=state.expiresAt;story=s;renderChapter(0);startClocks()}catch(e){clearPrivate();showScreen(e.status===410?'expired':'login');if(e.status!==401&&e.status!==410)$('#login-feedback').textContent=e.message}}
function startClocks(){clearInterval(clockHandle);clearInterval(statusHandle);updateTimer();clockHandle=setInterval(updateTimer,1000);statusHandle=setInterval(async()=>{try{const t=await api('/api/status');expiresAt=t.expiresAt;}catch(e){if(e.status===401||e.status===410){clearPrivate();showScreen('expired')}}},45000)}
function updateTimer(){if(!expiresAt)return;const time=expiresAt-Date.now();if(time<=0){clearPrivate();showScreen('expired');return}const h=Math.floor(time/3600000),m=Math.floor((time%3600000)/60000),s=Math.floor((time%60000)/1000);$('#timer').textContent=`Acceso ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
async function media(name){if(images.has(name))return images.get(name);const b=await api('/api/media/'+encodeURIComponent(name),{blob:true});const object=URL.createObjectURL(b);images.set(name,object);return object}
function observeImage(img,name){img.loading='lazy';img.dataset.file=name;if(!observer)observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){const im=entry.target;observer.unobserve(im);media(im.dataset.file).then(u=>{if(token)im.src=u}).catch(()=>{im.alt='Imagen temporalmente no disponible'})}}},{rootMargin:'250px'});observer.observe(img)}
function mediaButton(file,caption){const b=el('button',{class:'photo-card',type:'button','aria-label':'Ampliar: '+caption});const fig=el('figure');const image=el('img',{alt:caption});observeImage(image,file);fig.append(image,el('figcaption',{},caption));b.append(fig);b.addEventListener('click',async()=>{try{const src=await media(file);$('#big-photo').src=src;$('#photo-caption').textContent=caption;$('#photo-dialog').showModal()}catch(e){alert(e.message)}});return b}
function galleryCaption(file){return story.gallery.find(g=>g.file===file)?.caption||'Un recuerdo'}
function renderPhotos(parent,files,cls='mosaic'){const wrap=el('div',{class:cls});for(const file of files)wrap.append(mediaButton(file,galleryCaption(file)));parent.append(wrap)}
function renderQuotes(parent,idx){if(!idx?.length)return;const wrap=el('div',{class:'timeline'});for(const i of idx){const q=story.quotes[i];if(!q)continue;const b=el('button',{class:'quote-toggle',type:'button','aria-expanded':'false'});const row=el('div',{class:'quote-head'});const left=el('div');left.append(el('time',{},q.date),el('strong',{},q.heading));row.append(left,el('span',{},'＋'));const body=el('div',{class:'quote-body'});body.append(el('p',{class:'quote-text'},'“'+q.quote+'”'),el('div',{class:'quote-author'},'— '+q.author),el('p',{},q.context));b.append(row,body);b.onclick=()=>{const open=b.classList.toggle('open');b.setAttribute('aria-expanded',String(open));row.lastChild.textContent=open?'−':'＋'};wrap.append(b)}parent.append(wrap)}
function renderMemories(parent){const values=story.memoryTiles.map(x=>[x.symbol,x.label,x.message]);const buttons=el('div',{class:'memory-row'});const reveal=el('div',{class:'memory-reveal','aria-live':'polite'},'Toca cada recuerdo para revelar un pequeño mensaje.');values.forEach(([symbol,label,msg])=>{const b=el('button',{class:'memory-tile',type:'button'});b.append(el('span',{},symbol),el('span',{},label));b.onclick=()=>{[...buttons.children].forEach(x=>x.classList.remove('selected'));b.classList.add('selected');reveal.textContent=msg};buttons.append(b)});parent.append(buttons,reveal)}
function renderAllGallery(parent){const filters=[['todos','Todos'],['juntos','Momentos juntos'],['retratos','Sus fotografías'],['personales','Mis fotografías'],['detalles','Pequeños detalles']];const bar=el('div',{class:'filter-row'});const grid=el('div',{class:'gallery'});function fill(category){grid.replaceChildren();for(const item of story.gallery.filter(g=>category==='todos'||g.category===category))grid.append(mediaButton(item.file,item.caption))};for(const [key,label] of filters){const b=el('button',{class:'filter-chip'+(key==='todos'?' active':''),type:'button'},label);b.onclick=()=>{for(const btn of bar.children)btn.classList.remove('active');b.classList.add('active');fill(key)};bar.append(b)}parent.append(bar,grid);fill('todos');parent.append(el('p',{class:'gallery-epilogue'},'Lo sé, no soy el mejor fotógrafo, pero solo quería capturar lo linda que yo te veía.'));parent.append(el('p',{class:'footnote'},story.sourceNote))}
function renderStars(parent){const wrap=el('div',{class:'stars-game'});const result=el('div',{class:'star-message','aria-live':'polite'},'Toca las cuatro estrellas, en el orden que quieras.');story.miniGameMessages.forEach((msg,i)=>{const b=el('button',{class:'star-button',type:'button','aria-label':'Revelar estrella '+(i+1)},'✧');b.onclick=()=>{b.classList.add('done');b.textContent='♥';result.textContent=msg};wrap.append(b)});parent.append(wrap,result)}
function renderVideo(parent){const wrap=el('div',{class:'video-wrap'});const b=el('button',{class:'btn primary',type:'button'},'Ver nuestro video ↗');b.onclick=async()=>{b.disabled=true;b.textContent='Cargando video...';try{const src=await media(story.video);const vid=el('video',{controls:'',playsinline:'',preload:'metadata'});vid.src=src;wrap.replaceChildren(vid,el('p',{class:'footnote'},'Puedes pausar el video o continuar cuando quieras.'));}catch(e){b.disabled=false;b.textContent='Reintentar video';wrap.append(el('p',{class:'feedback'},e.message))}};wrap.append(b);parent.append(wrap)}
function renderLetter(parent){const div=el('div',{class:'letter'});story.letter.forEach(t=>div.append(el('p',{},t)));parent.append(div)}
function renderReflection(parent){const box=el('div',{class:'narrative-card'});box.append(el('p',{class:'reflection'},'No quiero pedirte que olvides lo difícil. Quiero saber escuchar, responsabilizarme de mis errores y entender tus necesidades, aunque tu decisión sea no volver.'));parent.append(box)}
function renderVoice(parent){
 const panel=el('section',{class:'voice-keep'});
 panel.append(el('p',{class:'eyebrow'},'UNA VOZ QUE GUARDÉ CON CARIÑO'),el('h3',{},'El audio favorito que más me gusta de ti'),el('p',{},'Me gusta volver a escucharte y recordar tu risa.'));
 const btn=el('button',{class:'btn primary',type:'button'},'Escuchar el audio ♥');
 const msg=el('p',{class:'footnote'},'Audio privado: 31 segundos. Tú decides cuándo reproducirlo.');
 btn.onclick=async()=>{btn.disabled=true;btn.textContent='Cargando audio...';try{const src=await media(story.audio);const audio=el('audio',{controls:'',preload:'none'});audio.src=src;panel.replaceChildren(el('p',{class:'eyebrow'},'UNA VOZ QUE GUARDÉ CON CARIÑO'),el('h3',{},'El audio favorito que más me gusta de ti'),audio,msg)}catch(err){btn.disabled=false;btn.textContent='Volver a intentar';msg.textContent='No pudimos cargar el audio: '+err.message}};
 panel.append(btn,msg);parent.append(panel);
}
const COLAPSO='https://open.spotify.com/embed/track/7dT9D6117e5DbhnKxDLNW9';
function renderColapso(parent){
 const panel=el('section',{class:'song-panel'});
 panel.append(el('p',{class:'eyebrow'},'SI QUIERES, PODEMOS ESCUCHARLA'),el('h3',{},'Colapso · Kevin Kaarl'),el('p',{class:'footnote'},'La música es opcional. Para escucharla suave, baja primero el volumen de tu dispositivo. Spotify requiere que pulses reproducir.'));
 const btn=el('button',{class:'btn ghost',type:'button'},'Abrir música en Spotify ♫');
 btn.onclick=()=>{const frame=el('iframe',{src:COLAPSO,title:'Colapso de Kevin Kaarl, reproductor oficial de Spotify',loading:'lazy',allow:'autoplay; encrypted-media; clipboard-write'});btn.replaceWith(frame)};
 panel.append(btn);parent.append(panel);
}
function renderFarewell(parent){
 const panel=el('section',{class:'farewell-panel'});
 panel.append(el('p',{class:'eyebrow'},'UN ÚLTIMO MENSAJE'),el('h3',{},'Gracias por recorrer nuestra historia, Fer.'),el('p',{},'Te regreso todo lo que me diste, porque conservarlo me ha causado dolor. En la USB quiero entregarte nuestros momentos, nuestros mensajes, lo que fuimos. Me hubiera gustado conservar algo, pero me duele mucho.'),el('p',{},'Gracias por haber compartido estos recuerdos conmigo. Con cariño, Alim.'));
 parent.append(panel);
}
function renderReply(parent){
 const panel=el('div',{class:'reply-panel'});
 panel.append(el('p',{},'Aquí puedes escribirme lo que verdaderamente sientes. Si envías una carta, llegará por correo electrónico a Alim. Tu texto no se publica en la página.'));
 const form=el('form',{id:'letter-form'});
 const choiceLabel=el('label',{for:'response-choice'},'Lo que me gustaría expresar');
 const choice=el('select',{id:'response-choice',required:''});
 const choices=[['','Elige la opción que mejor te represente'],['hablar','Me gustaria Conversar, hablemos'],['cerrar','Adios, Alim'],['compartir','Solo quiero compartir lo que siento']];
 for(const [value,label] of choices)choice.append(el('option',{value},label));
 const textLabel=el('label',{for:'response-letter'},'Mi carta, con mis propias palabras');
 const textarea=el('textarea',{id:'response-letter',maxlength:'10000',required:'',rows:'8',placeholder:'Cuéntame lo que sientes...'});
 const consent=el('div',{class:'consent-row'});
 const check=el('input',{id:'consent-send',type:'checkbox',required:''});
 consent.append(check,el('label',{for:'consent-send'},'Acepto enviar mi carta a Alim por correo electrónico.'));
 const button=el('button',{class:'btn primary',type:'submit'},'Enviar mi carta ↗');
 const feedback=el('p',{class:'feedback','aria-live':'polite'});
 const copy=el('button',{class:'soft-option',type:'button'},'Copiar mi carta sin enviarla');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(textarea.value);feedback.textContent='Carta copiada. Tú decides si la compartes.'}catch(_){textarea.select();feedback.textContent='Selecciona el texto para copiarlo.'}};
 const close=el('button',{class:'soft-option',type:'button'},'Prefiero no enviar nada');
 const notification=el('p',{class:'reply-privacy'},'Privacidad: al escoger «Prefiero no enviar nada», Alim recibirá únicamente un aviso con esa elección. No recibirá ningún borrador ni el contenido de tu carta.');
 function finishChoice(farewell){form.remove();const concluding=el('p',{class:'feedback'},'Gracias por estar aquí, Fer. Puedes cerrar la página cuando quieras.');panel.append(concluding);if(farewell)renderFarewell(panel)}
 close.onclick=async()=>{close.disabled=true;button.disabled=true;feedback.textContent='';try{await api('/api/no-reply',{method:'POST',data:{}})}catch(err){console.warn('Aviso no confirmado:',err.message)}finishChoice(true)};
 form.append(choiceLabel,choice,textLabel,textarea,consent,button,copy,notification,close,feedback);
 textarea.addEventListener('input',()=>{letterId=null});choice.addEventListener('change',()=>{letterId=null});
 form.addEventListener('submit',async e=>{e.preventDefault();if(!check.checked)return;button.disabled=true;button.textContent='Enviando...';try{letterId=letterId||makeId();const r=await api('/api/letter',{method:'POST',data:{choice:choice.value,message:textarea.value,consent:true,id:letterId}});feedback.textContent=r.ok?'Tu carta se ha enviado correctamente. Gracias por escribir.':'No se confirmó el envío.';if(r.ok){if(choice.value==='cerrar'){finishChoice(true)}else{button.textContent='Carta enviada ✓';button.disabled=true;textarea.readOnly=true;choice.disabled=true;check.disabled=true;close.disabled=true}}}catch(err){feedback.textContent=err.message;button.disabled=false;button.textContent='Intentar enviar mi carta'}});
 panel.append(form);parent.append(panel);
}
function renderChapter(n){if(!story)return;step=Math.max(0,Math.min(n,story.chapters.length-1));const c=story.chapters[step];const root=$('#chapter-article');root.replaceChildren();if(step===0){const p=el('div',{class:'narrative-card prologue'});p.append(el('p',{class:'eyebrow'},'ESTE LUGAR ES PARA TI'),el('h3',{},story.title),el('p',{},story.intro));root.append(p)}const hero=el('div',{class:'chapter-hero'});hero.append(el('p',{class:'eyebrow'},c.eyebrow),el('h2',{},c.title),el('p',{class:'subhead'},c.subtitle),el('p',{class:'description'},c.description));root.append(hero);if(c.interaction==='gallery'){renderAllGallery(root)}else if(c.interaction==='letter'){renderLetter(root)}else if(c.interaction==='reply'){root.append(el('p',{class:'reply-plea'},'Fernanda, por favor, escríbeme. No lo dejes vacío.'));renderReply(root);renderColapso(root)}else {if(c.interaction==='memory')renderMemories(root);if(c.interaction==='stars')renderStars(root);if(c.interaction==='reflection')renderReflection(root);if(c.photos?.length)renderPhotos(root,c.photos,'mosaic');if(c.quoteIndices?.length)renderQuotes(root,c.quoteIndices);if(c.interaction==='video'){renderVideo(root);if(story.audio)renderVoice(root)}}$('#chapter-number').textContent=c.eyebrow;$('#chapter-progress').textContent=`${String(step+1).padStart(2,'0')} / ${String(story.chapters.length).padStart(2,'0')}`;$('#progress-fill').style.width=((step+1)/story.chapters.length*100)+'%';$('#back-button').disabled=step===0;$('#next-button').hidden=step===story.chapters.length-1;$('#next-button').textContent='Continuar ↗';showScreen('story');window.scrollTo({top:0,behavior:'smooth'});}
$('#login-form').addEventListener('submit',e=>{e.preventDefault();const pin=$('#pin').value.replace(/\D/g,'');$('#login-feedback').textContent='';if(pin.length<6)return $('#login-feedback').textContent='El código debe tener al menos seis cifras.';login(pin)});
$('#reset-form').addEventListener('submit',async e=>{e.preventDefault();const pin=$('#reset-pin').value.replace(/\D/g,'');try{const r=await api('/api/reset',{method:'POST',data:{pin},auth:false});$('#reset-feedback').textContent=r.message;clearPrivate();$('#reset-pin').value='';setTimeout(()=>showScreen('login'),1200)}catch(err){$('#reset-feedback').textContent=err.message}});
$('#back-button').onclick=()=>renderChapter(step-1);$('#next-button').onclick=()=>renderChapter(step+1);$('#skip-button').onclick=()=>renderChapter(story.chapters.length-1);
$('#logout-button').onclick=()=>{api('/api/logout',{method:'POST'}).catch(()=>{});clearPrivate();showScreen('login')};
$('#close-photo').onclick=()=>$('#photo-dialog').close();$('#close-music').onclick=()=>$('#music-dialog').close();
$('#music-button').onclick=()=>{const box=$('#music-player');if(!box.childElementCount){const iframe=el('iframe',{src:spotifyUrl(),title:'Música opcional en Spotify',loading:'lazy',allow:'autoplay; encrypted-media; clipboard-write'});box.append(iframe)}$('#music-dialog').showModal()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token&&expiresAt&&Date.now()>=expiresAt){clearPrivate();showScreen('expired')}});
if(location.hostname.endsWith("github.io")&&!window.PUBLIC_CONFIG?.apiBase){showScreen("setup")}else{restoreSession()}
