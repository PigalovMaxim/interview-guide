(function () {
  'use strict';
  const { tabs, topics, ratingLabels, materials, interviewMethod } = window.InterviewContent;
  const store = window.InterviewStore;
  const byId = new Map(materials.map(item => [item.id, item]));
  const list = document.getElementById('material-list');
  const dialog = document.getElementById('clear-dialog');
  const clearButton = document.getElementById('clear-ratings');
  const copyRequests = new WeakMap();
  let activeTab = 'junior';
  let activeTopic = 'javascript';
  let current = [];

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  /* Небольшая подсветка: исходный код только отображается, не выполняется. */
  function highlight(code) {
    const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|yield|true|false|null|undefined)\b|\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)\b/g;
    let result = '';
    let cursor = 0;
    for (const match of code.matchAll(pattern)) {
      result += escape(code.slice(cursor, match.index));
      const token = match[0];
      const type = token.startsWith('//') || token.startsWith('/*') ? 'comment' :
        ['"', "'", '`'].includes(token[0]) ? 'string' : /^\d/.test(token) ? 'number' : 'keyword';
      result += '<span class="token ' + type + '">' + escape(token) + '</span>';
      cursor = match.index + token.length;
    }
    return result + escape(code.slice(cursor));
  }

  function codeBlock(code, language = 'javascript') {
    const label = { javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', text: 'для обсуждения' }[language] || 'для обсуждения';
    return '<pre tabindex="0" aria-label="Код ' + escape(label) + '"><code>' + highlight(code) + '</code></pre>';
  }

  function questionBody(item) {
    const source = item.source;
    const origin = source
      ? '<p class="question-source">Источник вопроса: <a href="' + escape(source.url) + '" target="_blank" rel="noreferrer">' + escape(source.provider) + ' ↗</a> · уровень источника: ' + escape(source.level) + ' · получен ' + escape(source.retrievedAt) + '</p>'
      : item.origin === 'project-editorial' ? '<p class="question-source">Происхождение: редакционный кейс проекта</p>' : '';
    return '<section class="candidate-question"><h3>Спросите кандидата</h3><p class="question-guidance">Сначала дайте время на самостоятельный ответ.</p><p class="question-wording">' + escape(item.question || item.title) + '</p>' +
      origin +
      (item.questionCode ? '<div class="question-code"><span class="section-label">Пример для обсуждения</span>' + codeBlock(item.questionCode, item.questionCodeLanguage) + '</div>' : '') +
      '</section>';
  }

  function analysis(item) {
    const criteria = ['basic', 'confident', 'deep'].map((value, index) =>
      '<div><dt><span class="criterion-mark">' + '·'.repeat(index + 1) + '</span>' + ratingLabels[value] + '</dt><dd>' + escape(item.assessment[value]) + '</dd></div>').join('');
    return '<div class="analysis-content">' +
      (item.source && item.editorial ? '<p class="editorial-note">Ответ, пояснения, критерии и уточнения подготовлены редакцией приложения; это не ответы источника вопроса.</p>' : '') +
      '<div class="answer"><span class="section-label">Краткий ответ</span><p>' + escape(item.shortAnswer) + '</p></div>' +
      '<section><h3>Как это работает</h3><p>' + escape(item.explanation) + '</p></section>' +
      (item.solution ? '<section><h3>Решение</h3>' + codeBlock(item.solution.code) + '</section>' : '') +
      (item.edgeCases ? '<section><h3>Крайние случаи</h3><ul>' + item.edgeCases.map(edge => '<li>' + escape(edge) + '</li>').join('') + '</ul><p><strong>Сложность.</strong> ' + escape(item.complexity) + '</p></section>' : '') +
      '<section><h3>На что обратить внимание</h3><dl class="criteria">' + criteria + '</dl></section>' +
      '<section><h3>Уточнение после ответа</h3><p class="follow-up-guidance">' + escape(interviewMethod.followUps) + '</p><div class="follow-ups">' + item.followUps.map(branch => '<section class="follow-up follow-up-' + escape(branch.kind) + '"><h4>' + (branch.kind === 'support' ? 'При затруднении' : 'При уверенном ответе · перенос') + '</h4><p class="follow-up-question">' + escape(branch.question) + '</p><p class="follow-up-expected"><strong>Признак понимания:</strong> ' + escape(branch.expected) + '</p></section>').join('') + '</div></section>' +
      '</div>';
  }

  function taskBody(item) {
    return '<div class="candidate-label"><span aria-hidden="true">↗</span> Для кандидата · внешний редактор</div>' + questionBody(item) + (item.statement === item.question ? '' : '<h3>Точные условия задачи</h3><p>' + escape(item.statement) + '</p>') +
      '<section><h3>Пример</h3>' + item.examples.map(example => '<p class="example">' + escape(example) + '</p>').join('') + '</section>' +
      '<div class="code-heading"><h3>Стартовый код</h3><div class="code-actions" role="group" aria-label="Действия со стартовым кодом"><button class="text-button" data-action="copy-code">Скопировать код <span aria-hidden="true">⧉</span></button><a class="primary-button code-editor-link" href="https://codefile.io/" target="_blank" rel="noopener noreferrer" aria-label="Открыть Codefile в новой вкладке">Открыть Codefile <span aria-hidden="true">↗</span></a></div></div>' + codeBlock(item.starterCode) +
      '<button class="secondary-button" data-action="copy-task">Скопировать задачу <span aria-hidden="true">↗</span></button><p role="status" class="copy-status"></p><div class="copy-fallback"></div>' +
      '<div class="interviewer-divider"><span>Только для интервьюера</span></div><button class="analysis-toggle" data-action="analysis" aria-expanded="false" aria-controls="' + escape(item.id) + '-analysis">Показать разбор <span aria-hidden="true">+</span></button>' +
      '<div id="' + escape(item.id) + '-analysis" class="task-analysis" hidden>' + analysis(item) + '</div>';
  }

  function card(item) {
    const level = item.tab === 'advanced' ? '<span class="target-level">Ожидаемый уровень: ' + escape(item.targetLevel) + ' · ' + item.angles.map(angle => angle === 'engineering' ? 'инженерный кейс' : 'неочевидный нюанс').join(' / ') + '</span>' : '';
    const options = Object.entries(ratingLabels).map(([value, label]) => '<button data-action="rate" data-rating="' + value + '" aria-pressed="false">' + label + '</button>').join('');
    return '<article class="material-card" data-material-id="' + escape(item.id) + '"><h2><button class="card-trigger" data-action="disclosure" aria-expanded="false" aria-controls="' + escape(item.id) + '-body" id="' + escape(item.id) + '-heading">' +
      '<span class="ordinal">' + String(item.ordinal).padStart(2, '0') + '</span><span class="card-title"><span>' + escape(item.title) + '</span>' + level + '</span><span class="rating-badge unrated">Без оценки</span><span class="expand-icon" aria-hidden="true">+</span></button></h2>' +
      '<div class="card-disclosure" aria-hidden="true" inert id="' + escape(item.id) + '-body" role="region" aria-labelledby="' + escape(item.id) + '-heading"><div class="disclosure-inner"><div class="card-body">' +
      (item.kind === 'task' ? taskBody(item) : questionBody(item) + '<div class="interviewer-divider"><span>Ориентиры для интервьюера</span></div>' + analysis(item)) +
      '<fieldset class="rating-control"><legend>Глубина ответа на этот вопрос</legend><div class="rating-options">' + options + '<button class="remove-rating" data-action="rate" data-rating="" aria-pressed="true">Без оценки</button></div><p>Оценка относится к этому материалу и выбранному уровню.</p></fieldset></div></div></div></article>';
  }

  function renderState(state) {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]').content = state.theme === 'dark' ? '#282c34' : '#eae7df';
    document.getElementById('theme-toggle').setAttribute('aria-checked', String(state.theme === 'light'));
    document.getElementById('theme-icon').textContent = state.theme === 'dark' ? '☼' : '◐';
    document.getElementById('theme-label').textContent = state.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
    document.getElementById('interview-progress').textContent = 'Оценено ' + Object.keys(state.ratingsById).length + ' из ' + materials.length + ' материалов';
    document.getElementById('list-progress').textContent = current.filter(item => state.ratingsById[item.id]).length + ' оценено';
    const notices = document.getElementById('notices');
    notices.replaceChildren();
    for (const message of [state.legacyNotice, state.ratingsNotice, state.themeNotice]) {
      if (!message) continue;
      const notice = document.createElement('p');
      notice.className = 'notice';
      notice.textContent = message;
      notices.append(notice);
    }
    for (const article of list.querySelectorAll('.material-card')) {
      const rating = state.ratingsById[article.dataset.materialId];
      const badge = article.querySelector('.rating-badge');
      badge.className = 'rating-badge ' + (rating || 'unrated');
      badge.textContent = ratingLabels[rating] || 'Без оценки';
      for (const button of article.querySelectorAll('[data-action="rate"]')) {
        const selected = button.dataset.rating === (rating || '');
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('selected', selected && Boolean(rating));
      }
    }
  }

  function renderList() {
    const topic = topics.find(item => item.key === activeTopic);
    const tab = tabs.find(item => item.key === activeTab);
    document.getElementById('topic-title').textContent = topic.label;
    document.getElementById('topic-description').textContent = topic.description;
    document.getElementById('topic-kicker').textContent = tab.description;
    document.getElementById('level-guidance').textContent = tab.guidance;
    document.getElementById('material-panel').setAttribute('aria-labelledby', 'tab-' + activeTab);
    for (const button of document.querySelectorAll('[data-action="topic"]')) {
      const selected = button.dataset.topic === activeTopic;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      button.querySelector('.topic-arrow').textContent = selected ? '↗' : '';
    }
    for (const button of document.querySelectorAll('[role="tab"]')) {
      const selected = button.dataset.tab === activeTab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    current = materials.filter(item => item.tab === activeTab && item.topic === activeTopic).sort((a, b) => a.ordinal - b.ordinal);
    document.getElementById('list-count').textContent = current.length + ' материалов';
    list.innerHTML = current.length ? current.map(card).join('') : '<div class="empty-state" role="status"><h3>Пока нет материалов</h3><p>Выберите другую тему или вкладку.</p></div>';
    renderState(store.getState());
  }

  function hideAnalysis(article) {
    const button = article.querySelector('[data-action="analysis"]');
    if (!button) return;
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = 'Показать разбор <span aria-hidden="true">+</span>';
    article.querySelector('.task-analysis').hidden = true;
  }

  async function copyTask(article, codeOnly) {
    const item = byId.get(article.dataset.materialId);
    const text = codeOnly ? item.starterCode : [item.title, item.question, ...(item.statement === item.question ? [] : ['Точные условия:', item.statement]), 'Примеры:', ...item.examples, 'Стартовый код:', item.starterCode].filter(Boolean).join('\n\n');
    const request = (copyRequests.get(article) || 0) + 1;
    copyRequests.set(article, request);
    const status = article.querySelector('.copy-status');
    const fallback = article.querySelector('.copy-fallback');
    status.textContent = '';
    fallback.replaceChildren();
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* Ручное копирование ниже. */ }
    if (!article.isConnected || copyRequests.get(article) !== request) return;
    if (copied) {
      status.textContent = codeOnly ? 'Стартовый код скопирован.' : 'Задание скопировано.';
      return;
    }
    status.textContent = 'Не удалось скопировать. Выделите и скопируйте текст вручную.';
    const area = document.createElement('div');
    area.className = 'manual-copy';
    const label = document.createElement('label');
    label.htmlFor = item.id + '-manual';
    label.textContent = 'Текст для ручного копирования';
    const textarea = document.createElement('textarea');
    textarea.id = label.htmlFor;
    textarea.readOnly = true;
    textarea.rows = 9;
    textarea.value = text;
    const button = document.createElement('button');
    button.textContent = 'Выделить текст';
    button.addEventListener('click', () => { textarea.focus(); textarea.select(); });
    area.append(label, textarea, button);
    fallback.append(area);
  }

  document.getElementById('topic-nav').innerHTML = topics.map(topic => '<button class="topic-button" data-action="topic" data-topic="' + topic.key + '"><span class="topic-icon" aria-hidden="true">' + escape(topic.icon) + '</span><span>' + escape(topic.label) + '</span><span class="topic-arrow" aria-hidden="true"></span></button>').join('');
  document.getElementById('level-tabs').innerHTML = tabs.map((tab, index) => '<button role="tab" id="tab-' + tab.key + '" data-action="tab" data-tab="' + tab.key + '" aria-controls="material-panel">' + escape(tab.label) + '<span>' + (tab.key === 'advanced' ? 'Кейсы и нюансы' : index + 1) + '</span></button>').join('');

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'theme-toggle') { store.setTheme(store.getState().theme === 'dark' ? 'light' : 'dark'); return; }
    if (button.id === 'clear-ratings') { dialog.returnValue = ''; dialog.showModal(); return; }
    const action = button.dataset.action;
    if (action === 'topic') {
      if (activeTopic !== button.dataset.topic) { activeTopic = button.dataset.topic; renderList(); }
      return;
    }
    if (action === 'tab') {
      if (activeTab !== button.dataset.tab) { activeTab = button.dataset.tab; renderList(); }
      return;
    }
    const article = button.closest('[data-material-id]');
    if (!article) return;
    if (action === 'disclosure') {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.querySelector('.expand-icon').textContent = open ? '−' : '+';
      article.classList.toggle('is-open', open);
      const body = article.querySelector('.card-disclosure');
      body.classList.toggle('expanded', open);
      body.setAttribute('aria-hidden', String(!open));
      body.toggleAttribute('inert', !open);
      if (!open) hideAnalysis(article);
      else {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const align = () => {
          if (article.isConnected && button.getAttribute('aria-expanded') === 'true') {
            article.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
          }
        };
        const animations = body.getAnimations();
        if (reducedMotion || !animations.length) align();
        else void Promise.allSettled(animations.map(animation => animation.finished)).then(align);
      }
    } else if (action === 'analysis') {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.innerHTML = (open ? 'Скрыть разбор' : 'Показать разбор') + '<span aria-hidden="true">' + (open ? '−' : '+') + '</span>';
      article.querySelector('.task-analysis').hidden = !open;
    } else if (action === 'rate') store.rate(article.dataset.materialId, button.dataset.rating || null);
    else if (action === 'copy-code' || action === 'copy-task') void copyTask(article, action === 'copy-code');
  });

  document.getElementById('level-tabs').addEventListener('keydown', event => {
    const button = event.target.closest('[role="tab"]');
    if (!button) return;
    let index = tabs.findIndex(tab => tab.key === button.dataset.tab);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    activeTab = tabs[index].key;
    renderList();
    document.getElementById('tab-' + activeTab).focus();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'clear') store.clear();
    clearButton.focus();
  });
  document.getElementById('bank-count').textContent = materials.length;
  document.getElementById('sidebar-count').textContent = materials.length + ' материалов · ' + tabs.length + ' вкладки';
  store.subscribe(renderState);
  renderList();
}());
