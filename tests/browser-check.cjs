/* PLAYWRIGHT_MODULE указывает на внешнюю установку Playwright.
   BROWSER_PATH позволяет выбрать установленный Chromium/Edge. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { root, loadContent } = require('./helpers.cjs');
const { readOfficeZip, reportFor } = require('./export-helpers.cjs');
const previous = require('./fixtures/previous-bank.json').cards;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const content = loadContent();
const webRoot = path.join(root,'web');
const server = http.createServer((request,response) => {
  const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const file = path.resolve(webRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if (!file.startsWith(webRoot+path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file,(error,bytes)=>{
    if(error){response.writeHead(404).end();return;}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
    response.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'}).end(bytes);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
    const context=await browser.newContext({viewport:{width:1365,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    await context.addInitScript(()=>{
      const scroll=Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView=function(options){
        const result=scroll.call(this,options);
        if(this.matches('.material-card')){
          window.cardScrollCalls=(window.cardScrollCalls||0)+1;
          window.lastCardScroll={behavior:options.behavior,topAfter:this.getBoundingClientRect().top};
        }
        return result;
      };
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
        window.clipboardAttempts=(window.clipboardAttempts||0)+1;
        if(window.rejectClipboard)throw Error('clipboard denied');
        window.copiedTask=text;
      }}});
    });
    const page=await context.newPage();
    async function assertBranches(article,item){
      for(const branch of item.followUps){
        const rendered=article.locator('.follow-up-'+branch.kind);
        assert.equal(await rendered.locator('.follow-up-question').textContent(),branch.question,item.id+': '+branch.kind+' question');
        assert.equal(await rendered.locator('.follow-up-expected').textContent(),'Признак понимания: '+branch.expected,item.id+': '+branch.kind+' expected');
      }
    }
    async function copyFresh(article,action,expected){
      const previous=await page.evaluate(()=>{window.copiedTask=undefined;return window.clipboardAttempts||0;});
      await article.locator(`[data-action="${action}"]`).click();
      await page.waitForFunction(({previous,expected})=>window.clipboardAttempts===previous+1&&(expected===null?window.copiedTask===undefined:window.copiedTask===expected),{previous,expected});
    }
    const downloadDirectory=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'interview-guide-browser-qa');
    fs.mkdirSync(downloadDirectory,{recursive:true});
    async function checkReportFiles(ratings, label, reportPage=page){
      const report=reportFor(content,ratings);
      for(const format of ['docx','xlsx']){
        const pending=reportPage.waitForEvent('download');
        await reportPage.locator(`[data-export="${format}"]`).click();
        const download=await pending;
        assert.match(download.suggestedFilename(),new RegExp('^interview-results-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z\\.'+format+'$'));
        const destination=path.join(downloadDirectory,label+'.'+format);
        await download.saveAs(destination);
        assert.equal(await download.failure(),null);
        const parts=readOfficeZip(fs.readFileSync(destination));
        const parsed=await reportPage.evaluate(entries=>{
          const result={};
          for(const [name,text] of entries){
            const doc=new DOMParser().parseFromString(text,'application/xml');
            if(doc.querySelector('parsererror'))throw Error('Invalid XML: '+name);
            if(name==='word/document.xml'){
              result.wordText=doc.documentElement.textContent;
              result.word=[...doc.getElementsByTagNameNS('*','tbl')].map(table=>
                [...table.getElementsByTagNameNS('*','tr')].map(row=>[...row.getElementsByTagNameNS('*','tc')].map(cell=>cell.textContent)));
            }
            if(name.startsWith('xl/worksheets/'))result[name]=[...doc.getElementsByTagNameNS('*','row')].map(row=>
              [...row.children].map(cell=>cell.textContent));
          }
          return result;
        },[...parts]);
        if(format==='xlsx'){
          assert.deepEqual(parsed['xl/worksheets/sheet1.xml'][0].slice(0,5),['Итоги интервью','Оценено',String(report.rated),'Всего','540']);
          assert.equal(parsed['xl/worksheets/sheet1.xml'][0][5],'Дата выгрузки');
          assert.ok(Number.isFinite(Date.parse(parsed['xl/worksheets/sheet1.xml'][0][6])));
          assert.equal(parsed['xl/worksheets/sheet1.xml'][0][7],'Редакция 4');
          assert.deepEqual(parsed['xl/worksheets/sheet1.xml'][1],['Уровень','Тема','Оценено','Всего',...report.ratingLabels]);
          assert.deepEqual(parsed['xl/worksheets/sheet1.xml'].slice(2),report.levels.flatMap(level=>level.topics.map(topic=>
            [level.label,topic.label,topic.rated,topic.total,...topic.counts].map(String))));
          assert.deepEqual(parsed['xl/worksheets/sheet2.xml'].slice(1),report.ratedItems.map(item=>[item.level,item.topic,item.title,item.rating]));
        }else{
          assert.equal(parsed.word.length,report.levels.length+(report.rated?1:0));
          for(const [index,level] of report.levels.entries()){
            assert.ok(parsed.wordText.includes(level.label+' · '+level.rated+'/135 оценено'));
            assert.deepEqual(parsed.word[index][0],['Тема','Оценено','Всего',...report.ratingLabels]);
            assert.deepEqual(parsed.word[index].slice(1),level.topics.map(topic=>[topic.label,topic.rated,topic.total,...topic.counts].map(String)));
          }
          if(report.rated)assert.deepEqual(parsed.word.at(-1).slice(1),report.ratedItems.map(item=>[item.level,item.topic,item.title,item.rating]));
          else assert.ok(parsed.wordText.includes('Пока нет оценённых материалов.'));
        }
        assert.match(await reportPage.locator('#export-status').innerText(),new RegExp('оценено '+report.rated+' из 540'));
      }
    }
    const errors=[];
    const initialScripts=new Map();
    page.on('request',request=>{
      if(request.resourceType()!=='script')return;
      const url=new URL(request.url());
      initialScripts.set(url.pathname,url.searchParams.get('v'));
    });
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('.material-card');
    for(const script of ['/data/catalog.js',...content.topics.filter(topic=>topic.key!=='coding').map(topic=>`/data/${topic.key}.js`)]){
      assert.equal(initialScripts.get(script),String(content.revision),script);
    }
    for(const script of ['/app.js','/results.js','/results-export.js'])assert.equal(initialScripts.get(script),'4-ui3',script);
    assert.equal(await page.locator('link[rel="stylesheet"]').getAttribute('href'),'styles.css?v=4-ui3');
    const archivedRatings=Object.fromEntries(previous.map((card,index)=>[card.id,['no_answer','basic','confident','deep'][index%4]]));
    const archive=JSON.stringify({schemaVersion:1,ratingsById:archivedRatings});
    const firstProject=content.materials.find(card=>card.origin==='project-editorial'&&card.topic==='javascript'&&card.tab==='junior');
    const archiveV2=JSON.stringify({schemaVersion:1,ratingsById:{[firstProject.id.replace(/^project:/,'v2:')]:'deep',[content.materials.find(card=>card.kind==='task').id]:'basic'}});
    await page.evaluate(({archive,archiveV2})=>{localStorage.setItem('interview-guide.ratings',archive);localStorage.setItem('interview-guide.ratings.v2',archiveV2);localStorage.setItem('interview-guide.theme','light');},{archive,archiveV2});
    await page.reload();
    await page.waitForSelector('.material-card');
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),{});
    assert.match(await page.locator('#bank-revision').innerText(),/Редакция 4 · 480 вопросов \+ 60 практических задач/);
    assert.ok(await page.locator('#notices').innerText());
    const originalCards=content.materials.filter(card=>card.source||card.kind==='task');
    assert.equal(originalCards.length,145);
    const currentRatings=Object.fromEntries(originalCards.map((card,index)=>[card.id,['no_answer','basic','confident','deep'][index%4]]));
    await page.evaluate(({key,ratings})=>localStorage.setItem(key,JSON.stringify({schemaVersion:1,ratingsById:ratings})),{key:content.ratingsStorageKey,ratings:currentRatings});
    await page.reload();
    await page.waitForSelector('.material-card');
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),currentRatings);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings')),archive);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings.v2')),archiveV2);
    assert.equal(await page.evaluate(()=>window.InterviewStore.getState().theme),'light');
    let copies=0;
    for(const topic of content.topics)for(const tab of content.tabs){
      await page.locator(`[data-action="topic"][data-topic="${topic.key}"]`).click();
      await page.locator(`[data-action="tab"][data-tab="${tab.key}"]`).click();
      const items=content.materials.filter(card=>card.topic===topic.key&&card.tab===tab.key).sort((a,b)=>a.ordinal-b.ordinal);
      assert.equal(await page.locator('.material-card').count(),15,topic.key+'/'+tab.key);
      assert.equal(await page.locator('.follow-up-support').count(),items.length);
      assert.equal(await page.locator('.follow-up-transfer').count(),items.length);
      assert.equal(await page.locator('.follow-up-expected').count(),items.length*2);
      assert.equal(await page.locator('#level-guidance').innerText(),tab.guidance);
      assert.ok(!(await page.locator('#material-list').innerText()).includes('[object Object]'));
      assert.equal(await page.locator('#list-count').innerText(),'15 материалов');
      assert.equal(await page.locator('.empty-state').count(),0);
      assert.deepEqual(await page.locator('.ordinal').allTextContents(),Array.from({length:15},(_,index)=>String(index+1).padStart(2,'0')));
      assert.deepEqual(await page.locator('.rating-badge').allTextContents(),items.map(item=>content.ratingLabels[currentRatings[item.id]]||'Без оценки'));
      if(tab.key==='advanced'){
        const angleLabels={engineering:'инженерный кейс',nuance:'неочевидный нюанс'};
        assert.deepEqual(await page.locator('.target-level').allTextContents(),items.map(item=>'Ожидаемый уровень: '+item.targetLevel+' · '+item.angles.map(angle=>angleLabels[angle]).join(' / ')));
      }
      const first=page.locator('.material-card').first();
      await first.locator('[data-action="disclosure"]').click();
      await first.locator('.question-wording').waitFor({state:'visible'});
      const visibleTitles=await page.locator('.card-title > span:first-child').allTextContents();
      assert.deepEqual(visibleTitles,items.map(item=>item.title));
      assert.equal(await first.locator('.question-wording').textContent(),items[0].question);
      if(topic.key==='coding'){
        for(const item of items){
          const article=page.locator(`[data-material-id="${item.id}"]`);
          if(await article.locator('[data-action="disclosure"]').getAttribute('aria-expanded')!=='true')await article.locator('[data-action="disclosure"]').click();
          assert.equal(await article.locator('.task-analysis').isVisible(),false);
          const editor=article.getByRole('link',{name:'Открыть Codefile в новой вкладке'});
          assert.equal(await editor.count(),1,item.id+': Codefile link');
          assert.equal(await editor.getAttribute('href'),'https://codefile.io/');
          assert.equal(await editor.getAttribute('target'),'_blank');
          assert.deepEqual((await editor.getAttribute('rel')).split(/\s+/).sort(),['noopener','noreferrer']);
          assert.equal(await article.locator('.code-actions [data-action="copy-code"]').count(),1);
          assert.equal(await article.locator('.code-actions .code-editor-link').count(),1);
          const expected=[item.title,item.question,...(item.statement===item.question?[]:['Точные условия:',item.statement]),'Примеры:',...item.examples,'Стартовый код:',item.starterCode].filter(Boolean).join('\n\n');
          assert.equal((await article.locator('p').allTextContents()).filter(text=>text===item.question).length,1,item.id+': условие повторено');
          await copyFresh(article,'copy-task',expected);
          await article.locator('[data-action="analysis"]').click();
          assert.equal(await article.locator('.follow-up-transfer').isVisible(),true);
          await assertBranches(article,item);
          await copyFresh(article,'copy-task',expected);
          await page.evaluate(()=>{window.rejectClipboard=true;});
          await copyFresh(article,'copy-task',null);
          await article.locator('.manual-copy textarea').waitFor();
          assert.equal(await article.locator('.manual-copy textarea').inputValue(),expected);
          await page.evaluate(()=>{window.rejectClipboard=false;});
          await copyFresh(article,'copy-code',item.starterCode);
          await article.locator('[data-action="disclosure"]').click();
          copies++;
        }
      }else{
        assert.equal(await first.locator('.follow-up-support h4').innerText(),'При затруднении');
        assert.match(await first.locator('.follow-up-transfer h4').innerText(),/перенос/);
        const rendered=await page.locator('.material-card').evaluateAll(cards=>cards.map(card=>{
          const value=selector=>card.querySelector(selector)?.textContent??null;
          return {
            id:card.dataset.materialId, question:value('.question-wording'), code:value('.question-code code'),
            source:value('.question-source'), sourceURL:card.querySelector('.question-source a')?.getAttribute('href')??null,
            editorial:value('.editorial-note'), criteria:[...card.querySelectorAll('.criteria dd')].map(node=>node.textContent),
            references:[...card.querySelectorAll('.references a')].map(link=>link.getAttribute('href')),
            followUps:['support','transfer'].map(kind=>[value('.follow-up-'+kind+' .follow-up-question'),value('.follow-up-'+kind+' .follow-up-expected')])
          };
        }));
        for(const [index,item] of items.entries()){
          const actual=rendered[index];
          assert.equal(actual.id,item.id);
          assert.equal(actual.question,item.question,item.id);
          assert.equal(actual.code,item.questionCode??null,item.id);
          assert.deepEqual(actual.references,[],item.id);
          assert.deepEqual(actual.criteria,['basic','confident','deep'].map(key=>item.assessment[key]),item.id);
          assert.deepEqual(actual.followUps,item.followUps.map(branch=>[branch.question,'Признак понимания: '+branch.expected]),item.id);
          if(item.source){
            assert.equal(actual.sourceURL,item.source.url,item.id);
            assert.ok(actual.source.includes('уровень источника: '+item.source.level),item.id);
            assert.match(actual.editorial,/редакцией приложения/,item.id);
          }else{
            assert.equal(actual.source,'Происхождение: редакционный кейс проекта',item.id);
            assert.equal(actual.sourceURL,null,item.id);
            assert.equal(actual.editorial,null,item.id);
          }
        }
        const project=items.find(item=>item.origin==='project-editorial');
        const projectCard=page.locator(`[data-material-id="${project.id}"]`);
        if(project!==items[0])await projectCard.locator('[data-action="disclosure"]').click();
        await projectCard.locator('[data-action="rate"][data-rating="deep"]').click();
        assert.equal(await projectCard.locator('.rating-badge').innerText(),'Глубоко');
        currentRatings[project.id]='deep';
      }
    }
    assert.equal(copies,60);
    assert.equal(await page.locator('.assessment-guidance,.references').count(),0);
    const rated=await page.evaluate(()=>window.InterviewStore.getState().ratingsById);
    assert.deepEqual(rated,currentRatings);
    await page.reload();
    await page.waitForSelector('.material-card');
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),rated);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings')),archive);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings.v2')),archiveV2);
    await page.locator('a[href="#results"]').first().click();
        await page.locator('#results').waitFor({state:'visible'});
    assert.equal(await page.locator('#results').isVisible(),true);
    assert.ok((await page.locator('#results-progress').innerText()).includes('540'));
    assert.equal(await page.locator('#bank-count').innerText(),'540');
    for(const tab of content.tabs){
      const result=page.locator(`[data-results-tab="${tab.key}"]`);
      const ratedInTab=content.materials.filter(card=>card.tab===tab.key&&rated[card.id]);
      assert.equal(await result.locator('.result-total').innerText(),ratedInTab.length+'/135 оценено');
      for(const topic of content.topics){
        const covered=ratedInTab.filter(card=>card.topic===topic.key).length;
        await result.locator(`.legend-button[data-results-topic="${topic.key}"]`).click();
        assert.equal(await result.locator('.topic-coverage').innerText(),'Покрытие: '+covered+'/15 вопросов темы оценено.');
      }
    }
    await checkReportFiles(rated,'rated-results');
    await page.evaluate(()=>{window.originalExport=window.InterviewResultsExport.build;window.InterviewResultsExport.build=()=>{throw Error('test export error');};});
    await page.locator('[data-export="docx"]').click();
    assert.match(await page.locator('#export-status').innerText(),/Не удалось подготовить/);
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),rated);
    await page.evaluate(()=>{window.InterviewResultsExport.build=window.originalExport;delete window.originalExport;});
    await page.locator('a[href="#questions"]').first().click();
        await page.locator('#questions').waitFor({state:'visible'});
    await page.locator('[data-action="topic"][data-topic="javascript"]').click();
    await page.locator('[data-action="tab"][data-tab="junior"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="middle"]').getAttribute('aria-selected'),'true');
    await page.locator('[data-action="tab"][data-tab="junior"]').click();
    for(const width of [1365,390])for(const motion of ['reduce','no-preference'])for(const index of [0,10,14]){
      await page.setViewportSize({width,height:width===390?844:1000});
      await page.emulateMedia({reducedMotion:motion});
      const scrollCard=page.locator('.material-card').nth(index);
      const trigger=scrollCard.locator('[data-action="disclosure"]');
      await trigger.focus();
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.keyboard.press('Enter');
      await page.waitForFunction(id=>Math.abs(document.querySelector(`[data-material-id="${id}"]`).getBoundingClientRect().top-16)<3,await scrollCard.getAttribute('data-material-id'));
      assert.equal(await trigger.getAttribute('aria-expanded'),'true');
      assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);
      const observed=await page.evaluate(()=>window.lastCardScroll);
      assert.equal(observed.behavior,motion==='reduce'?'instant':'smooth');
      if(motion==='reduce')assert.ok(Math.abs(observed.topAfter-16)<3,'reduced-motion scroll was not immediate');
      const calls=await page.evaluate(()=>window.cardScrollCalls);
      await page.keyboard.press('Enter');
      assert.equal(await trigger.getAttribute('aria-expanded'),'false');
      assert.equal(await page.evaluate(()=>window.cardScrollCalls),calls);
    }
    await page.setViewportSize({width:1365,height:1000});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('.material-card').first().locator('[data-action="disclosure"]').click();
    const screenshotDirectory=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'interview-guide-browser-qa');
    fs.mkdirSync(screenshotDirectory,{recursive:true});
    await page.locator('.material-card').first().screenshot({path:path.join(screenshotDirectory,'desktop-card.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    for(const tab of content.tabs){
      await page.locator(`[data-tab="${tab.key}"]`).click();
      const card=page.locator('.material-card[data-material-id^="project:"]').first();
      if(await card.locator('[data-action="disclosure"]').getAttribute('aria-expanded')!=='true')await card.locator('[data-action="disclosure"]').click();
      await card.locator('.follow-up-transfer').waitFor({state:'visible'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow: '+tab.key);
      assert.equal(await card.locator('.follow-up-transfer').isVisible(),true);
    }
    await page.locator('.material-card[data-material-id^="project:"]').first().locator('.follow-up-transfer').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(screenshotDirectory,'mobile-transfer.png'),animations:'disabled'});
    await page.locator('[data-action="topic"][data-topic="coding"]').click();
    const mobileTask=page.locator('.material-card').first();
    await mobileTask.locator('[data-action="disclosure"]').click();
    await mobileTask.locator('[data-action="analysis"]').click();
    await mobileTask.locator('.follow-up-transfer').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow: advanced coding');
    for(const width of [320,390])for(const theme of ['dark','light']){
      await page.setViewportSize({width,height:844});
      await page.evaluate(value=>window.InterviewStore.setTheme(value),theme);
      const editor=mobileTask.getByRole('link',{name:'Открыть Codefile в новой вкладке'});
      const copy=mobileTask.locator('[data-action="copy-code"]');
      assert.equal(await editor.isVisible(),true);
      assert.equal(await copy.isVisible(),true);
      await copy.focus();
      await page.keyboard.press('Tab');
      assert.equal(await editor.evaluate(link=>document.activeElement===link),true);
      const style=await editor.evaluate(link=>{
        const styles=getComputedStyle(link);
        const luminance=color=>{
          const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
          return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
        };
        const a=luminance(styles.backgroundColor),b=luminance(styles.color);
        const bounds=link.getBoundingClientRect();
        return {contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),background:styles.backgroundColor,outline:styles.outlineStyle,left:bounds.left,right:bounds.right};
      });
      assert.ok(style.contrast>=4.5,theme+': Codefile contrast '+style.contrast);
      assert.notEqual(style.background,'rgba(0, 0, 0, 0)');
      assert.notEqual(style.outline,'none');
      assert.ok(style.left>=0&&style.right<=width,theme+': Codefile outside viewport');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),theme+': mobile task overflow at '+width);
    }
    await page.emulateMedia({forcedColors:'active'});
    await mobileTask.locator('[data-action="copy-code"]').focus();
    await page.keyboard.press('Tab');
    const forcedEditor=mobileTask.locator('.code-editor-link');
    const forcedStyle=await forcedEditor.evaluate(link=>{
      const style=getComputedStyle(link);
      return {focused:document.activeElement===link,borderStyle:style.borderTopStyle,borderWidth:parseFloat(style.borderTopWidth),borderColor:style.borderTopColor,background:style.backgroundColor,outlineStyle:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),outlineColor:style.outlineColor};
    });
    assert.equal(forcedStyle.focused,true);
    assert.notEqual(forcedStyle.borderStyle,'none');
    assert.ok(forcedStyle.borderWidth>0);
    assert.notEqual(forcedStyle.borderColor,forcedStyle.background);
    assert.notEqual(forcedStyle.outlineStyle,'none');
    assert.ok(forcedStyle.outlineWidth>0);
    assert.notEqual(forcedStyle.outlineColor,forcedStyle.background);
    await page.emulateMedia({forcedColors:'none'});
    await mobileTask.locator('.code-actions').screenshot({path:path.join(screenshotDirectory,'mobile-code-actions.png'),animations:'disabled'});
    await context.route('https://codefile.io/',route=>route.fulfill({contentType:'text/html',body:'<title>Codefile test destination</title>'}));
    const beforeLink=await page.evaluate(()=>window.InterviewStore.getState().ratingsById);
    const popupPending=page.waitForEvent('popup');
    assert.equal(await forcedEditor.evaluate(link=>document.activeElement===link),true);
    await page.keyboard.press('Enter');
    const popup=await popupPending;
    await popup.waitForLoadState();
    assert.equal(popup.url(),'https://codefile.io/');
    assert.equal(await popup.evaluate(()=>window.opener===null),true);
    await popup.close();
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),beforeLink);
    assert.equal(await mobileTask.locator('.task-analysis').isVisible(),true);
    await page.locator('#clear-ratings').click();
    await page.locator('#clear-dialog button[value="clear"]').click();
    await page.waitForFunction(()=>Object.keys(window.InterviewStore.getState().ratingsById).length===0);
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),{});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),content.ratingsStorageKey),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings')),archive);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings.v2')),archiveV2);
    await page.locator('a[href="#results"]').first().click();
    await page.locator('#results').waitFor({state:'visible'});
    await checkReportFiles({},'empty-results');
    const reactCards=content.materials.filter(item=>item.tab==='senior'&&item.topic==='react');
    const cssCard=content.materials.find(item=>item.tab==='middle'&&item.topic==='css');
    const mixedRatings={[reactCards[0].id]:'no_answer',[reactCards[1].id]:'deep',[cssCard.id]:'basic'};
    await page.evaluate(ratings=>{for(const [id,rating] of Object.entries(ratings))window.InterviewStore.rate(id,rating);},mixedRatings);
    await page.locator('a[href="#questions"]').first().click();
    await page.locator('#questions').waitFor({state:'visible'});
    await page.locator('[data-action="topic"][data-topic="html"]').click();
    await page.locator('[data-action="tab"][data-tab="junior"]').click();
    assert.deepEqual(await page.locator('.rating-badge').allTextContents(),Array(15).fill('Без оценки'));
    await page.locator('a[href="#results"]').first().click();
    await page.locator('#results').waitFor({state:'visible'});
    await page.locator('[data-results-tab="junior"] .legend-button[data-results-topic="html"]').click();
    assert.equal(await page.locator('.result-card').count(),4);
    assert.equal(await page.locator('.legend-button').count(),36);
    await checkReportFiles(mixedRatings,'mixed-results');
    await page.evaluate(id=>window.InterviewStore.rate(id,null),cssCard.id);
    const seniorRatings={[reactCards[0].id]:'no_answer',[reactCards[1].id]:'deep'};
    await checkReportFiles(seniorRatings,'removed-middle-results');
    await page.evaluate(id=>window.InterviewStore.rate(id,null),reactCards[1].id);
    const noAnswerRatings={[reactCards[0].id]:'no_answer'};
    await checkReportFiles(noAnswerRatings,'no-answer-results');
    await page.evaluate(id=>window.InterviewStore.rate(id,null),reactCards[0].id);
    await checkReportFiles({},'removed-last-results');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile export overflow');
    await page.screenshot({path:path.join(downloadDirectory,'mobile-results-export.png'),animations:'disabled'});
    assert.deepEqual(errors,[]);
    const localPage=await context.newPage();
    localPage.on('pageerror',error=>errors.push(error.message));
    await localPage.goto(pathToFileURL(path.join(webRoot,'index.html')).href);
    await localPage.waitForSelector('.material-card');
    assert.equal(await localPage.evaluate(()=>window.InterviewContent.materials.length),content.materials.length);
    assert.match(await localPage.locator('#bank-revision').innerText(),/Редакция 4/);
    assert.equal(await localPage.locator('.card-title > span:first-child').first().innerText(),content.materials.find(card=>card.topic==='javascript'&&card.tab==='junior'&&card.ordinal===1).title);
    await localPage.locator('a[href="#results"]').first().click();
    await localPage.locator('#results').waitFor({state:'visible'});
    await checkReportFiles(await localPage.evaluate(()=>window.InterviewStore.getState().ratingsById),'local-results',localPage);
    await localPage.evaluate(ratings=>{for(const [id,rating] of Object.entries(ratings))window.InterviewStore.rate(id,rating);},mixedRatings);
    await checkReportFiles(mixedRatings,'local-mixed-results',localPage);
    assert.deepEqual(errors,[]);
    await localPage.close();
    console.log(`Браузерная проверка пройдена: 36 групп по 15, копирование и ссылки Codefile всех 60 задач, контраст и клавиатура двух тем при 320/390px, восстановление v3, итоги, Word/Excel со всеми, смешанными, no_answer-only и пустыми оценками, ошибка экспорта, прокрутка с reduced motion и без него, мобильный экран и file://. Снимки и файлы: ${screenshotDirectory}`);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
