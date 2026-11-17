/* PLAYWRIGHT_MODULE указывает на внешнюю установку Playwright.
   BROWSER_PATH позволяет выбрать установленный Chromium/Edge. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { root, loadContent } = require('./helpers.cjs');
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
    const context=await browser.newContext({viewport:{width:1365,height:1000}});
    await context.addInitScript(()=>{
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
    for(const script of ['/app.js','/data/catalog.js',...content.topics.filter(topic=>topic.key!=='coding').map(topic=>`/data/${topic.key}.js`)]){
      assert.equal(initialScripts.get(script),String(content.revision),script);
    }
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
          assert.deepEqual(actual.references,item.references,item.id);
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
    await page.locator('a[href="#questions"]').first().click();
        await page.locator('#questions').waitFor({state:'visible'});
    await page.locator('[data-action="topic"][data-topic="javascript"]').click();
    await page.locator('[data-action="tab"][data-tab="junior"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="middle"]').getAttribute('aria-selected'),'true');
    await page.locator('[data-action="tab"][data-tab="junior"]').click();
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
    await page.locator('#clear-ratings').click();
    await page.locator('#clear-dialog button[value="clear"]').click();
    await page.waitForFunction(()=>Object.keys(window.InterviewStore.getState().ratingsById).length===0);
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),{});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),content.ratingsStorageKey),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings')),archive);
    assert.equal(await page.evaluate(()=>localStorage.getItem('interview-guide.ratings.v2')),archiveV2);
    assert.deepEqual(errors,[]);
    const localPage=await context.newPage();
    localPage.on('pageerror',error=>errors.push(error.message));
    await localPage.goto(pathToFileURL(path.join(webRoot,'index.html')).href);
    await localPage.waitForSelector('.material-card');
    assert.equal(await localPage.evaluate(()=>window.InterviewContent.materials.length),content.materials.length);
    assert.match(await localPage.locator('#bank-revision').innerText(),/Редакция 4/);
    assert.equal(await localPage.locator('.card-title > span:first-child').first().innerText(),content.materials.find(card=>card.topic==='javascript'&&card.tab==='junior'&&card.ordinal===1).title);
    assert.deepEqual(errors,[]);
    await localPage.close();
    console.log(`Браузерная проверка пройдена: 36 групп по 15, источники и редакционные кейсы, копирование 60 задач, восстановление v3, сохранность архивов v1/v2, итоги, клавиатура, четыре вкладки на мобильной ширине и локальное открытие. Снимки: ${screenshotDirectory}`);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
