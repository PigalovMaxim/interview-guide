(function () {
  'use strict';
  const { tabs, topics, ratingLabels, materials } = window.InterviewContent;
  const store = window.InterviewStore;
  const grid = document.getElementById('results-grid');
  const results = document.getElementById('results');
  const questions = document.getElementById('questions');
  const main = document.getElementById('materials');
  const skipLink = document.querySelector('.skip-link');
  const cards = new Map();
  const selectedTopics = new Map();
  const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const ratingKeys = Object.keys(ratingLabels);
  let summary;
  let ratingsSnapshot;
  let activeScreen;

  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function aggregate(ratingsById) {
    const byTab = new Map(tabs.map(tab => [tab.key, {
      total: 0,
      rated: 0,
      topics: new Map(topics.map(topic => [topic.key, {
        total: 0,
        rated: 0,
        ratings: Object.fromEntries(ratingKeys.map(key => [key, 0]))
      }]))
    }]));
    for (const item of materials) {
      const tab = byTab.get(item.tab);
      const topic = tab && tab.topics.get(item.topic);
      if (!topic) continue;
      tab.total += 1;
      topic.total += 1;
      const rating = ratingsById[item.id];
      if (!Object.prototype.hasOwnProperty.call(ratingsById, item.id) || !ratingKeys.includes(rating)) continue;
      tab.rated += 1;
      topic.rated += 1;
      topic.ratings[rating] += 1;
    }
    return byTab;
  }

  function share(count, total) {
    return percent.format(total ? count / total * 100 : 0) + '%';
  }

  function slicePath(start, end) {
    const point = fraction => {
      const angle = fraction * Math.PI * 2 - Math.PI / 2;
      return [120 + 104 * Math.cos(angle), 120 + 104 * Math.sin(angle)];
    };
    const from = point(start);
    const to = point(end);
    return 'M 120 120 L ' + from.join(' ') + ' A 104 104 0 ' + (end - start > 0.5 ? 1 : 0) + ' 1 ' + to.join(' ') + ' Z';
  }

  function createCards() {
    grid.innerHTML = tabs.map(tab => '<section class="result-card" data-results-tab="' + tab.key + '" aria-labelledby="results-' + tab.key + '-title">' +
      '<div class="result-heading"><div><h2 id="results-' + tab.key + '-title">' + escape(tab.label) + '</h2><p>' + escape(tab.description) + '</p></div><span class="result-total"></span></div>' +
      '<div class="result-chart"><svg class="results-pie" viewBox="0 0 240 240" role="group" aria-labelledby="pie-' + tab.key + '-title pie-' + tab.key + '-description"><title id="pie-' + tab.key + '-title">' + escape(tab.label) + ': доли тем среди оценённых вопросов</title><desc id="pie-' + tab.key + '-description"></desc><g class="pie-shapes"></g></svg><p class="pie-caption"></p></div>' +
      '<p class="legend-heading" id="legend-' + tab.key + '">Темы · число и доля оценённых</p><div class="results-legend" role="group" aria-labelledby="legend-' + tab.key + '">' +
      topics.map(topic => '<button type="button" class="legend-button topic-color-' + topic.key + '" data-results-topic="' + topic.key + '" aria-pressed="false"><span class="topic-swatch" aria-hidden="true"></span><span class="legend-label">' + escape(topic.label) + '</span><span class="legend-value"></span></button>').join('') + '</div>' +
      '<section class="topic-details" aria-live="polite" aria-atomic="true" aria-labelledby="detail-' + tab.key + '"><h3 id="detail-' + tab.key + '"></h3><p class="topic-coverage"></p><dl class="rating-counts">' +
      ratingKeys.map(key => '<div><dt>' + escape(ratingLabels[key]) + '</dt><dd data-results-rating="' + key + '">0</dd></div>').join('') + '</dl></section></section>').join('');
    for (const card of grid.children) cards.set(card.dataset.resultsTab, card);
  }

  function renderChart(card, tab, values) {
    const positive = topics.filter(topic => values.topics.get(topic.key).rated > 0);
    const shapes = card.querySelector('.pie-shapes');
    card.querySelector('.results-pie').setAttribute('role', positive.length ? 'group' : 'img');
    card.querySelector('desc').textContent = positive.length ? 'Размеры секторов — доли тем среди ' + values.rated + ' оценённых вопросов. Выберите сектор или кнопку в легенде для подробностей.' : 'Нет оценённых вопросов. Выберите тему в легенде, чтобы увидеть её покрытие и оценки.';
    if (!positive.length) {
      shapes.innerHTML = '<circle class="pie-empty" cx="120" cy="120" r="104"></circle><text class="pie-empty-label" x="120" y="125" text-anchor="middle">Нет оценок</text>';
    } else {
      let counted = 0;
      shapes.innerHTML = positive.map(topic => {
        const count = values.topics.get(topic.key).rated;
        const start = counted / values.rated;
        counted += count;
        const shape = positive.length === 1 ? 'circle cx="120" cy="120" r="104"' : 'path d="' + slicePath(start, counted / values.rated) + '"';
        const tag = positive.length === 1 ? 'circle' : 'path';
        const label = topic.label + ': ' + count + ' из ' + values.rated + ' оценённых, ' + share(count, values.rated) + '. Показать оценки темы.';
        return '<' + shape + ' class="pie-slice topic-color-' + topic.key + '" data-results-topic="' + topic.key + '" role="button" tabindex="0" aria-pressed="false" aria-label="' + escape(label) + '"><title>' + escape(label) + '</title></' + tag + '>';
      }).join('');
    }
    card.querySelector('.result-total').textContent = values.rated + '/' + values.total + ' оценено';
    card.querySelector('.pie-caption').textContent = values.rated ? '100% круга = ' + values.rated + ' оценённых вопросов · ' + tab.label : 'Пока нет оценок. Вопросы без отметки не входят в круг.';
    for (const button of card.querySelectorAll('.legend-button')) {
      const value = values.topics.get(button.dataset.resultsTopic);
      button.querySelector('.legend-value').textContent = value.rated + ' · ' + share(value.rated, values.rated);
    }
  }

  function renderSelection(tabKey) {
    const card = cards.get(tabKey);
    const topicKey = selectedTopics.get(tabKey);
    const topic = topics.find(item => item.key === topicKey);
    const values = summary.get(tabKey).topics.get(topicKey);
    for (const button of card.querySelectorAll('[data-results-topic]')) {
      const selected = button.dataset.resultsTopic === topicKey;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('selected', selected);
    }
    card.querySelector('.topic-details h3').textContent = topic.label;
    card.querySelector('.topic-coverage').textContent = 'Покрытие: ' + values.rated + '/' + values.total + ' вопросов темы оценено.';
    for (const count of card.querySelectorAll('[data-results-rating]')) count.textContent = values.ratings[count.dataset.resultsRating];
  }

  function renderResults(state) {
    const snapshot = JSON.stringify(state.ratingsById);
    if (snapshot === ratingsSnapshot) return;
    ratingsSnapshot = snapshot;
    document.getElementById('export-status').textContent = '';
    summary = aggregate(state.ratingsById);
    let rated = 0;
    for (const tab of tabs) {
      const values = summary.get(tab.key);
      rated += values.rated;
      if (!selectedTopics.has(tab.key)) selectedTopics.set(tab.key, (topics.find(topic => values.topics.get(topic.key).rated) || topics[0]).key);
      renderChart(cards.get(tab.key), tab, values);
      renderSelection(tab.key);
    }
    document.getElementById('results-progress').textContent = 'Оценено ' + rated + ' из ' + materials.length + ' материалов текущего интервью';
  }

  function selectTopic(target) {
    const tabKey = target.closest('[data-results-tab]').dataset.resultsTab;
    selectedTopics.set(tabKey, target.dataset.resultsTopic);
    renderSelection(tabKey);
  }

  function exportReport(format) {
    const status = document.getElementById('export-status');
    status.textContent = '';
    let url;
    let link;
    try {
      const ratings = store.getState().ratingsById;
      const values = aggregate(ratings);
      const report = {
        generatedAt: new Date().toISOString(),
        revision: window.InterviewContent.revision,
        total: materials.length,
        rated: [...values.values()].reduce((count, level) => count + level.rated, 0),
        ratingLabels: ratingKeys.map(key => ratingLabels[key]),
        levels: tabs.map(tab => ({
          label: tab.label, total: values.get(tab.key).total, rated: values.get(tab.key).rated,
          topics: topics.map(topic => {
            const data = values.get(tab.key).topics.get(topic.key);
            return { label: topic.label, total: data.total, rated: data.rated, counts: ratingKeys.map(key => data.ratings[key]) };
          }).filter(topic => topic.rated > 0)
        })).filter(level => level.rated > 0),
        ratedItems: tabs.flatMap(tab => topics.flatMap(topic => materials
          .filter(item => item.tab === tab.key && item.topic === topic.key && Object.hasOwn(ratings, item.id) && ratingKeys.includes(ratings[item.id]))
          .sort((a, b) => a.ordinal - b.ordinal)
          .map(item => ({ level: tab.label, topic: topic.label, title: item.title + ((item.statement || item.question) === item.title ? '' : ' — ' + (item.statement || item.question)), rating: ratingLabels[ratings[item.id]] }))))
      };
      const bytes = window.InterviewResultsExport.build(format, report);
      const type = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      url = URL.createObjectURL(new Blob([bytes], { type }));
      link = document.createElement('a');
      link.href = url;
      link.download = 'interview-results-' + report.generatedAt.replace(/[:.]/g, '-') + '.' + format;
      document.body.append(link);
      link.click();
      status.textContent = 'Подготовлен файл ' + (format === 'docx' ? 'Word' : 'Excel') + ' · оценено ' + report.rated + ' из ' + report.total + '.';
    } catch (error) {
      status.textContent = 'Не удалось подготовить файл. Попробуйте скачать ещё раз.';
    } finally {
      if (link) link.remove();
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  document.getElementById('results-export').addEventListener('click', event => {
    const button = event.target.closest('[data-export]');
    if (button) exportReport(button.dataset.export);
  });

  grid.addEventListener('click', event => {
    const target = event.target.closest('[data-results-topic]');
    if (target) selectTopic(target);
  });
  grid.addEventListener('keydown', event => {
    const target = event.target.closest('.pie-slice');
    if (!target || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    selectTopic(target);
  });

  function showScreen(focus) {
    const screen = window.location.hash === '#results' ? 'results' : 'questions';
    const changed = activeScreen !== screen;
    questions.hidden = screen !== 'questions';
    results.hidden = screen !== 'results';
    skipLink.href = screen === 'results' ? '#results' : '#materials';
    skipLink.textContent = screen === 'results' ? 'Перейти к итогам' : 'Перейти к материалам';
    for (const link of document.querySelectorAll('.screen-nav a')) {
      if (link.getAttribute('href') === '#' + screen) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = screen === 'results' ? 'Итоги интервью — Interview Guide' : 'Interview Guide — материалы для интервьюера';
    if (focus && changed) {
      (screen === 'results' ? results : main).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    activeScreen = screen;
  }

  skipLink.addEventListener('click', event => {
    event.preventDefault();
    (activeScreen === 'results' ? results : main).focus();
  });
  document.querySelector('.topbar').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || link.getAttribute('href') !== window.location.hash) return;
    if (link.hash !== '#questions' && link.hash !== '#results') return;
    event.preventDefault();
    (activeScreen === 'results' ? results : main).focus();
  });
  window.addEventListener('hashchange', () => showScreen(true));

  createCards();
  renderResults(store.getState());
  store.subscribe(renderResults);
  showScreen(window.location.hash === '#results');
}());
