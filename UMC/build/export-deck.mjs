import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(dir);
const logoSourcesFile=path.join(root,'assets/clients/sources.json');
const logoSources=fs.existsSync(logoSourcesFile)?JSON.parse(fs.readFileSync(logoSourcesFile,'utf8')).logos:[];
let require;
for(const base of [dir,process.env.NODE_PATH,'/Users/joozo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']){
 if(!base)continue;
 try{const r=createRequire(path.join(base,'_loader.cjs'));r.resolve('pptxgenjs');r.resolve('playwright');require=r;break;}catch{}
}
if(!require)throw new Error('Install pptxgenjs and playwright in build/, or set NODE_PATH');
const PptxGenJS=require('pptxgenjs');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const output=path.resolve(process.env.UMC_OUTPUT_DIR||path.join(dir,'generated'));
fs.mkdirSync(output,{recursive:true});
const backgroundDir=path.join(output,'backgrounds');fs.mkdirSync(backgroundDir,{recursive:true});
let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if(!executablePath&&!fs.existsSync(chromium.executablePath())){
 const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
 if(fs.existsSync(cache))for(const name of fs.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse()){
  const candidate=path.join(cache,name,'chrome-headless-shell-mac-arm64/chrome-headless-shell');
  if(fs.existsSync(candidate)){executablePath=candidate;break;}
 }
}
const browser=await chromium.launch(executablePath?{executablePath}:{});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:`*,*::before,*::after{animation:none!important;transition:none!important}.reveal,.floaty{opacity:1!important;transform:none!important}.deck-download,.deck-progress,.edit-toggle,.edit-hotzone,.edit-export,.edit-toast{display:none!important}`});
 const count=await page.evaluate(()=>deck.slides.length);
 if(count!==25)throw new Error(`Expected 25 slides, found ${count}`);
 const missing=await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
 if(missing.length)throw new Error('Missing images: '+missing.join(', '));
 const pptx=new PptxGenJS();pptx.defineLayout({name:'UMC',width:40/3,height:7.5});pptx.layout='UMC';
 pptx.title='微网通联业务介绍';pptx.subject='云通信业务介绍';pptx.author='微网通联';pptx.company='北京微网通联股份有限公司';pptx.lang='zh-CN';
 pptx.theme={headFontFace:'Heiti SC',bodyFontFace:'Heiti SC',lang:'zh-CN'};
 const models=[];
 for(let i=0;i<count;i++){
  await page.evaluate(i=>deck.showSlide(i),i);
  const model=await page.evaluate(()=>{
   const slide=deck.slides[deck.currentSlide], runs=[];
   const walker=document.createTreeWalker(slide,NodeFilter.SHOW_TEXT);
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
   for(let node;node=walker.nextNode();){
    if(!node.textContent.trim())continue;
    const el=node.parentElement,cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden')continue;
    let opacity=1;for(let e=el;e&&e!==slide.parentElement;e=e.parentElement)opacity*=Number(getComputedStyle(e).opacity);
    if(opacity<.001)continue;
    const value=node.textContent;
    let current=null;
    const flush=()=>{
     if(!current||!current.text.trim()){current=null;return;}
     const rgb=cs.color.match(/[\d.]+/g)?.map(Number)||[0,0,0];
     const color=rgb.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
     const font=/[\u2E80-\uFFFF]/.test(current.text)?'Heiti SC':'Arial';
     const fs=parseFloat(cs.fontSize),bold=Number(cs.fontWeight)>=600;
     ctx.font=`${cs.fontStyle} ${bold?'bold':'normal'} ${fs}px "${font}"`;
     const nativeWidth=ctx.measureText(current.text).width;
     const spacing=current.text.length>1?(current.w-nativeWidth)/(current.text.length-1):0;
     runs.push({...current,font,fontSize:fs,bold,italic:cs.fontStyle==='italic',color,alpha:opacity*(rgb[3]??1),spacing});
     current=null;
    };
    for(let n=0;n<value.length;n++){
     const range=document.createRange();range.setStart(node,n);range.setEnd(node,n+1);
     const r=range.getBoundingClientRect();
     if(r.width<.01||r.height<.01)continue;
     if(r.x< -1||r.y< -1||r.x>1920||r.y>1080)continue;
     if(current&&Math.abs(current.y-r.y)<1&&Math.abs((current.x+current.w)-r.x)<3){current.text+=value[n];current.w=r.right-current.x;current.h=Math.max(current.h,r.height);}
     else{flush();current={text:value[n],x:r.x,y:r.y,w:r.width,h:r.height};}
    }
    flush();
   }
   const svgImages=[...slide.querySelectorAll('.s24-cell img')].filter(img=>/\.svg$/i.test(img.getAttribute('src'))).map(img=>{
    const box=img.getBoundingClientRect();
    const scale=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    return {src:img.getAttribute('src'),alt:img.alt,x:box.x+(box.width-w)/2,y:box.y+(box.height-h)/2,w,h};
   });
   return {id:slide.id,text:slide.innerText,runs,svgImages};
  });
  models.push(model);
  const hide=await page.addStyleTag({content:'.slide,.slide *{-webkit-text-fill-color:transparent!important;text-shadow:none!important}.s24-cell img[src$=".svg"]{visibility:hidden!important}'});
  const bg=path.join(backgroundDir,`slide-${String(i+1).padStart(2,'0')}.png`);
  await page.screenshot({path:bg});await hide.evaluate(e=>e.remove());
  const pixels=PNG.sync.read(fs.readFileSync(bg));
  const slide=pptx.addSlide();slide.addImage({path:bg,x:0,y:0,w:40/3,h:7.5});
  for(const img of model.svgImages){
   slide.addImage({path:path.join(root,img.src),x:img.x/144,y:img.y/144,w:img.w/144,h:img.h/144,altText:img.alt,objectName:`Customer logo: ${img.alt}`});
  }
  for(const [n,r]of model.runs.entries()){
   const px=1/144;
   // Preblend alpha against the visual background: transparent text groups in
   // some office renderers clip widely spaced text to its unspaced bounds.
   let color=r.color;
   if(r.alpha<.999){
    const sums=[0,0,0];let samples=0;
    for(let x=r.x+2;x<Math.min(1920,r.x+r.w);x+=Math.max(3,r.w/30)){
     const y=Math.min(1079,Math.max(0,Math.round(r.y+r.h/2))),offset=(y*1920+Math.min(1919,Math.max(0,Math.round(x))))*4;
     for(let c=0;c<3;c++)sums[c]+=pixels.data[offset+c];samples++;
    }
    color=sums.map((v,c)=>Math.round(parseInt(r.color.slice(c*2,c*2+2),16)*r.alpha+(v/Math.max(1,samples))*(1-r.alpha)).toString(16).padStart(2,'0')).join('').toUpperCase();
   }
   slide.addText(r.text,{x:r.x*px,y:(r.y-2)*px,w:Math.min(r.w+12,1920-r.x)*px,h:(r.h+6)*px,fontFace:r.font,fontSize:r.fontSize*.5,bold:r.bold,italic:r.italic,color,charSpacing:r.spacing*.5,margin:0,breakLine:false,paraSpaceAfterPt:0,paraSpaceBeforePt:0,valign:'mid',wrap:false,vertAnchor:'ctr',objectName:`Text ${n+1}: ${r.text.slice(0,30)}`,lang:'zh-CN'});
  }
  const sources=model.svgImages.map(img=>logoSources.find(source=>source.file===img.src)).filter(Boolean);
  slide.addNotes(model.text+(sources.length?'\n\nLogo sources (iconfont, retrieved 2026-10-20):\n'+sources.map(source=>`${source.name}: icon ${source.iconfont_id}; ${source.collection}`).join('\n'):''));
  console.log(`Prepared ${i+1}/${count}: ${model.runs.length} editable text runs`);
 }
 fs.writeFileSync(path.join(output,'text-model.json'),JSON.stringify(models,null,2));
 await pptx.writeFile({fileName:path.join(output,'UMC.pptx')});
 await page.addStyleTag({content:`@media print{@page{size:1920px 1080px;margin:0}html,body{width:1920px!important;height:auto!important;margin:0!important}.deck-stage{transform:none!important;width:1920px!important;height:auto!important;overflow:visible!important}.slide{position:relative!important;inset:auto!important;visibility:visible!important;opacity:1!important;display:block!important;break-after:page!important}.slide:last-of-type{break-after:auto!important}.reveal,.floaty{opacity:1!important;transform:none!important}.deck-download,.deck-progress,.edit-toggle,.edit-hotzone,.edit-export,.edit-toast{display:none!important}}`});
 await page.pdf({path:path.join(output,'UMC.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,tagged:true});
 const bundledPython=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 const python=process.env.UMC_PYTHON||(fs.existsSync(bundledPython)?bundledPython:'python3');
 const normalized=spawnSync(python,[path.join(dir,'normalize-pdf.py'),path.join(output,'UMC.pdf')],{encoding:'utf8'});
 if(normalized.status!==0)throw new Error('PDF text normalization failed: '+normalized.stderr);
 console.log(normalized.stdout.trim());
 if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
 console.log('Exported editable PPTX and searchable PDF to '+output);
}finally{await browser.close();}
