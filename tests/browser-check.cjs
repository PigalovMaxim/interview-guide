/* PLAYWRIGHT_MODULE указывает на внешнюю установку Playwright.
   BROWSER_PATH позволяет выбрать установленный Chromium/Edge. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { root, loadContent } = require('./helpers.cjs');
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
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('.material-card');
    const oldRatings=Object.fromEntries(content.materials.map((card,index)=>[card.id,['no_answer','basic','confident','deep'][index%4]]));
    await page.evaluate(ratings=>localStorage.setItem('interview-guide.ratings',JSON.stringify({schemaVersion:1,ratingsById:ratings})),oldRatings);
    await page.reload();
    await page.waitForSelector('.material-card');
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),oldRatings);
    let copies=0;
    for(const topic of content.topics)for(const tab of content.tabs){
      await page.locator(`[data-action="topic"][data-topic="${topic.key}"]`).click();
      await page.locator(`[data-action="tab"][data-tab="${tab.key}"]`).click();
      assert.equal(await page.locator('.material-card').count(),15);
      assert.equal(await page.locator('.follow-up-support').count(),15);
      assert.equal(await page.locator('.follow-up-transfer').count(),15);
      assert.equal(await page.locator('.follow-up-expected').count(),30);
      assert.equal(await page.locator('#level-guidance').innerText(),tab.guidance);
      assert.ok(!(await page.locator('#material-list').innerText()).includes('[object Object]'));
      const first=page.locator('.material-card').first();
      await first.locator('[data-action="disclosure"]').click();
      await first.locator('.question-wording').waitFor({state:'visible'});
      const items=content.materials.filter(card=>card.topic===topic.key&&card.tab===tab.key).sort((a,b)=>a.ordinal-b.ordinal);
      assert.equal(await first.locator('.question-wording').textContent(),items[0].question);
      if(topic.key==='coding'){
        for(const item of items){
          const article=page.locator(`[data-material-id="${item.id}"]`);
          if(await article.locator('[data-action="disclosure"]').getAttribute('aria-expanded')!=='true')await article.locator('[data-action="disclosure"]').click();
          assert.equal(await article.locator('.task-analysis').isVisible(),false);
          const expected=[item.title,item.question,'Точные условия:',item.statement,'Примеры:',...item.examples,'Стартовый код:',item.starterCode].filter(Boolean).join('\n\n');
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
        for(const item of items)await assertBranches(page.locator(`[data-material-id="${item.id}"]`),item);
        await first.locator('[data-action="rate"][data-rating="deep"]').click();
        assert.equal(await first.locator('.rating-badge').innerText(),'Глубоко');
      }
    }
    assert.equal(copies,60);
    const rated=await page.evaluate(()=>window.InterviewStore.getState().ratingsById);
    await page.reload();
    await page.waitForSelector('.material-card');
    assert.deepEqual(await page.evaluate(()=>window.InterviewStore.getState().ratingsById),rated);
    await page.locator('a[href="#results"]').first().click();
    assert.equal(await page.locator('#results').isVisible(),true);
    assert.match(await page.locator('#results-progress').innerText(),/540/);
    await page.locator('a[href="#questions"]').first().click();
    await page.locator('[data-action="tab"][data-tab="junior"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="middle"]').getAttribute('aria-selected'),'true');
    await page.locator('[data-action="tab"][data-tab="junior"]').click();
    await page.locator('.material-card').first().locator('[data-action="disclosure"]').click();
    const screenshotDirectory=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'interview-guide-browser-qa');
    fs.mkdirSync(screenshotDirectory,{recursive:true});
    await page.locator('.material-card').first().screenshot({path:path.join(screenshotDirectory,'desktop-card.png')});
    await page.setViewportSize({width:390,height:844});
    for(const tab of content.tabs){
      await page.locator(`[data-tab="${tab.key}"]`).click();
      const card=page.locator('.material-card').first();
      if(await card.locator('[data-action="disclosure"]').getAttribute('aria-expanded')!=='true')await card.locator('[data-action="disclosure"]').click();
      await card.locator('.follow-up-transfer').waitFor({state:'visible'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow: '+tab.key);
      assert.equal(await card.locator('.follow-up-transfer').isVisible(),true);
    }
    await page.locator('.follow-up-transfer').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(screenshotDirectory,'mobile-transfer.png')});
    assert.deepEqual(errors,[]);
    console.log(`Браузерная проверка пройдена: 36 групп, копирование 60 задач (закрытый/открытый разбор, вручную, код), восстановление оценок, итоги, клавиатура, четыре уровня на мобильной ширине. Снимки: ${screenshotDirectory}`);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
