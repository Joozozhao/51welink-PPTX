import pptxgen from '/Users/joozo/WySync/ObBidding/wiki/pptx/Push/build/node_modules/pptxgenjs/dist/pptxgen.cjs.js';
import fs from 'fs';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
pptx.layout = 'W16x9';
const dir = 'build/shots-pdf';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
for (const f of files) {
    const slide = pptx.addSlide();
    slide.addImage({ path: `${dir}/${f}`, x: 0, y: 0, w: 13.333, h: 7.5 });
}
await pptx.writeFile({ fileName: 'GMP.pptx' });
console.log('GMP.pptx slides:', files.length);
